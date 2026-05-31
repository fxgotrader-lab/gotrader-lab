import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = "C:\\Users\\andre\\Downloads\\NATION OF DUVAL\\PRIVATE\\AI TRADER SET UP\\MNQ_06-26_OHLCV.xlsx";
const artifactName = "MNQ_06-26_OHLCV.normalized.json";
const localOutputPath = path.resolve(projectRoot, ".gotrader", "imports", artifactName);
const publicOutputPath = path.resolve(projectRoot, "public", "local-imports", artifactName);

const textDecoder = new TextDecoder("utf-8");
const symbolOptions = ["ES", "NQ", "MES", "MNQ"];
const timeframeOptions = ["1m", "5m", "15m", "1h", "4h", "1d"];

const argValue = (name) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const inputPath = path.resolve(argValue("--input") ?? defaultInput);

const readUInt16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const readUInt32 = (bytes, offset) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

const columnLetterToIndex = (cellRef) =>
  cellRef
    .replace(/[0-9]/g, "")
    .split("")
    .reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const decodeXml = (value) =>
  String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const attr = (text, name) => {
  const match = new RegExp(`${name}="([^"]*)"`).exec(text);
  return match ? decodeXml(match[1]) : undefined;
};

function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  let eocdOffset = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (readUInt32(bytes, index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Invalid .xlsx file: ZIP directory not found.");
  }

  const entryCount = readUInt16(bytes, eocdOffset + 10);
  let offset = readUInt32(bytes, eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(bytes, offset) !== 0x02014b50) {
      throw new Error("Invalid .xlsx file: central directory is malformed.");
    }
    const method = readUInt16(bytes, offset + 10);
    const compressedSize = readUInt32(bytes, offset + 20);
    const fileNameLength = readUInt16(bytes, offset + 28);
    const extraLength = readUInt16(bytes, offset + 30);
    const commentLength = readUInt16(bytes, offset + 32);
    const localHeaderOffset = readUInt32(bytes, offset + 42);
    const fileName = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    const localNameLength = readUInt16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUInt16(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const contents =
      method === 0
        ? compressed
        : method === 8
          ? new Uint8Array(zlib.inflateRawSync(Buffer.from(compressed)))
          : compressed;
    entries.set(fileName, contents);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

const entryText = (entries, name) => {
  const bytes = entries.get(name);
  return bytes ? textDecoder.decode(bytes) : "";
};

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml))) {
    const parts = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = tRegex.exec(match[1]))) {
      parts.push(decodeXml(textMatch[1]));
    }
    strings.push(parts.join(""));
  }
  return strings;
}

function parseWorkbookSheets(entries) {
  const workbookXml = entryText(entries, "xl/workbook.xml");
  const relsXml = entryText(entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new Error("Invalid .xlsx file: workbook metadata is missing.");
  }

  const rels = new Map();
  const relRegex = /<Relationship\b([^>]*)\/?>/g;
  let relMatch;
  while ((relMatch = relRegex.exec(relsXml))) {
    const id = attr(relMatch[1], "Id");
    const target = attr(relMatch[1], "Target");
    if (id && target) {
      rels.set(id, target);
    }
  }

  const sheets = [];
  const sheetRegex = /<sheet\b([^>]*)\/?>/g;
  let sheetMatch;
  while ((sheetMatch = sheetRegex.exec(workbookXml))) {
    const name = attr(sheetMatch[1], "name") ?? "Sheet";
    const relId = attr(sheetMatch[1], "r:id");
    const target = rels.get(relId) ?? "";
    const sheetPath = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^(\.\/)?/, "")}`.replace(/\\/g, "/");
    sheets.push({ name, path: sheetPath });
  }
  return sheets;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const values = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attr(attrs, "r") ?? "";
      const index = columnLetterToIndex(ref);
      const type = attr(attrs, "t");
      const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
      const inlineMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
      const raw = valueMatch ? decodeXml(valueMatch[1]) : inlineMatch ? decodeXml(inlineMatch[1]) : "";
      let value = raw;
      if (type === "s") {
        value = sharedStrings[Number(raw)] ?? "";
      } else if (type === "inlineStr") {
        value = raw;
      } else if (raw !== "" && Number.isFinite(Number(raw))) {
        value = Number(raw);
      }
      values[index] = value;
    }
    if (values.some((value) => value !== undefined && value !== "")) {
      rows.push(values);
    }
  }
  return rows;
}

function parseXlsxRows(buffer) {
  const entries = readZipEntries(buffer);
  const sheets = parseWorkbookSheets(entries);
  const sharedStrings = parseSharedStrings(entryText(entries, "xl/sharedStrings.xml"));
  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rows: parseSheetRows(entryText(entries, sheet.path), sharedStrings)
    }))
  };
}

const indexFor = (headers, aliases) => {
  const normalized = headers.map(normalizeHeader);
  return aliases
    .map(normalizeHeader)
    .map((alias) => normalized.indexOf(alias))
    .find((index) => index >= 0);
};

const detectSymbolContract = (fileName, fallbackSymbol = "MNQ") => {
  const match = fileName.toUpperCase().match(/\b(ES|NQ|MES|MNQ)[_\s-]*(\d{2}-\d{2})?/);
  return {
    symbol: match?.[1] && symbolOptions.includes(match[1]) ? match[1] : fallbackSymbol,
    contract: match?.[2]
  };
};

const excelSerialDate = (serial) => new Date(Date.UTC(1899, 11, 30) + serial * 86400000);

const valueAsDatePart = (value) => {
  if (typeof value === "number") {
    return excelSerialDate(value).toISOString().slice(0, 10);
  }
  return String(value ?? "").trim();
};

const valueAsTimePart = (value) => {
  if (typeof value === "number") {
    const totalSeconds = Math.round((value % 1) * 86400);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }
  return String(value ?? "").trim();
};

const parseTimestamp = (timestampValue, dateValue, timeValue) => {
  if (timestampValue !== undefined && timestampValue !== "") {
    const parsed = typeof timestampValue === "number" ? excelSerialDate(timestampValue) : new Date(String(timestampValue));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const datePart = valueAsDatePart(dateValue);
  const timePart = valueAsTimePart(timeValue || "00:00:00");
  const parsed = new Date(`${datePart}T${timePart}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const detectTimeframe = (minutes) => {
  if (!minutes) return undefined;
  if (minutes <= 1.5) return "1m";
  if (Math.abs(minutes - 5) <= 1) return "5m";
  if (Math.abs(minutes - 15) <= 2) return "15m";
  if (Math.abs(minutes - 60) <= 5) return "1h";
  if (Math.abs(minutes - 240) <= 10) return "4h";
  if (minutes >= 1200) return "1d";
  return undefined;
};

function normalizeRowsToArtifact({ fileName, rows, sheetName, sheetNames }) {
  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("open") && normalized.includes("high") && normalized.includes("low") && normalized.includes("close");
  });
  if (headerRowIndex < 0) {
    throw new Error("No OHLC header row found. Expected Open, High, Low, Close columns.");
  }

  const headers = rows[headerRowIndex];
  const dataRows = rows.slice(headerRowIndex + 1);
  const timestampIndex = indexFor(headers, ["timestamp", "datetime", "date time", "time"]);
  const dateIndex = indexFor(headers, ["date", "trading date"]);
  const timeIndex = indexFor(headers, ["time", "bar time"]);
  const openIndex = indexFor(headers, ["open", "o"]);
  const highIndex = indexFor(headers, ["high", "h"]);
  const lowIndex = indexFor(headers, ["low", "l"]);
  const closeIndex = indexFor(headers, ["close", "c", "last"]);
  const volumeIndex = indexFor(headers, ["volume", "vol"]);
  if ([openIndex, highIndex, lowIndex, closeIndex].some((index) => index === undefined)) {
    throw new Error("OHLC columns are incomplete. Expected Open, High, Low, Close.");
  }
  if (timestampIndex === undefined && dateIndex === undefined) {
    throw new Error("Timestamp data is missing. Expected Timestamp or Date/Time columns.");
  }

  const { symbol, contract } = detectSymbolContract(fileName);
  const candles = [];
  const warnings = [];
  const invalidRows = [];
  const timestampFailures = [];
  const seen = new Set();
  let duplicateTimestampsHandled = 0;

  dataRows.forEach((row, index) => {
    const timestamp = parseTimestamp(
      timestampIndex !== undefined && timestampIndex !== timeIndex ? row[timestampIndex] : undefined,
      dateIndex !== undefined ? row[dateIndex] : undefined,
      timeIndex !== undefined ? row[timeIndex] : undefined
    );
    if (!timestamp) {
      timestampFailures.push(index + headerRowIndex + 2);
      return;
    }

    const open = Number(row[openIndex]);
    const high = Number(row[highIndex]);
    const low = Number(row[lowIndex]);
    const close = Number(row[closeIndex]);
    const volume = volumeIndex !== undefined ? Number(row[volumeIndex]) : undefined;
    if (![open, high, low, close].every(Number.isFinite) || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      invalidRows.push(index + headerRowIndex + 2);
      return;
    }
    if (seen.has(timestamp)) {
      duplicateTimestampsHandled += 1;
      return;
    }
    seen.add(timestamp);
    candles.push({
      datetime: timestamp,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined
    });
  });

  candles.sort((left, right) => Date.parse(left.datetime) - Date.parse(right.datetime));

  const intervalCounts = new Map();
  for (let index = 1; index < candles.length; index += 1) {
    const deltaMinutes = Math.round((Date.parse(candles[index].datetime) - Date.parse(candles[index - 1].datetime)) / 60000);
    intervalCounts.set(deltaMinutes, (intervalCounts.get(deltaMinutes) ?? 0) + 1);
  }
  const dominantIntervalMinutes = [...intervalCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  let missingIntervalsDetected = 0;
  if (dominantIntervalMinutes) {
    for (let index = 1; index < candles.length; index += 1) {
      const deltaMinutes = Math.round((Date.parse(candles[index].datetime) - Date.parse(candles[index - 1].datetime)) / 60000);
      if (deltaMinutes > dominantIntervalMinutes * 1.5) {
        missingIntervalsDetected += Math.max(0, Math.round(deltaMinutes / dominantIntervalMinutes) - 1);
      }
    }
  }
  const sourceTimeframe = detectTimeframe(dominantIntervalMinutes) ?? "1m";

  if (timestampFailures.length) {
    warnings.push({
      code: "timestamp_parse_failures",
      message: `${timestampFailures.length} row(s) had missing or invalid timestamps.`,
      severity: "blocking"
    });
  }
  if (invalidRows.length) {
    warnings.push({
      code: "invalid_ohlc_rows",
      message: `${invalidRows.length} row(s) had non-numeric or invalid OHLC values.`,
      severity: "blocking"
    });
  }
  if (duplicateTimestampsHandled) {
    warnings.push({
      code: "duplicate_timestamps",
      message: `${duplicateTimestampsHandled} duplicate timestamp(s) were skipped.`,
      severity: "warning"
    });
  }
  if (missingIntervalsDetected) {
    warnings.push({
      code: "missing_intervals",
      message: `${missingIntervalsDetected} expected ${dominantIntervalMinutes ?? "detected"}-minute interval(s) are missing.`,
      severity: "warning"
    });
  }

  const blocking = warnings.some((warning) => warning.severity === "blocking");
  const sourceFileName = path.basename(fileName);
  const importId = `local_${symbol.toLowerCase()}_${contract ?? "unknown"}_${crypto
    .createHash("sha1")
    .update(`${sourceFileName}|${candles.length}|${candles[0]?.datetime}|${candles.at(-1)?.datetime}`)
    .digest("hex")
    .slice(0, 10)}`.replace(/[^a-zA-Z0-9_]/g, "_");

  return {
    importId,
    symbol,
    contract,
    sourceTimeframe,
    candles,
    firstTimestamp: candles[0]?.datetime,
    lastTimestamp: candles.at(-1)?.datetime,
    rawCandleCount: candles.length,
    validationSummary: {
      status: blocking ? "invalid" : warnings.length ? "valid_with_warnings" : "valid",
      warnings,
      duplicateTimestampsHandled,
      missingIntervalsDetected,
      dominantIntervalMinutes,
      columnNames: headers.map((header) => String(header ?? ""))
    },
    sourceFileName,
    generatedAt: new Date().toISOString(),
    sourceSheetName: sheetName,
    sourceSheetNames: sheetNames
  };
}

async function main() {
  const buffer = await fs.readFile(inputPath);
  const parsed = parseXlsxRows(buffer);
  const candidate =
    parsed.sheets.find((sheet) => {
      const headers = sheet.rows[0]?.map(normalizeHeader) ?? [];
      return headers.includes("open") && headers.includes("high") && headers.includes("low") && headers.includes("close");
    }) ?? parsed.sheets[0];

  if (!candidate) {
    throw new Error("No worksheet found in local MNQ history file.");
  }

  const artifact = normalizeRowsToArtifact({
    fileName: inputPath,
    rows: candidate.rows,
    sheetName: candidate.name,
    sheetNames: parsed.sheetNames
  });

  await fs.mkdir(path.dirname(localOutputPath), { recursive: true });
  await fs.mkdir(path.dirname(publicOutputPath), { recursive: true });
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  await fs.writeFile(localOutputPath, json, "utf8");
  await fs.writeFile(publicOutputPath, json, "utf8");

  process.stdout.write("Normalized local MNQ history artifact created.\n");
  process.stdout.write(`Input: ${inputPath}\n`);
  process.stdout.write(`Local artifact: ${localOutputPath}\n`);
  process.stdout.write(`Dev-served artifact: ${publicOutputPath}\n`);
  process.stdout.write(`Symbol: ${artifact.symbol}\n`);
  process.stdout.write(`Contract: ${artifact.contract ?? "n/a"}\n`);
  process.stdout.write(`Timeframe: ${artifact.sourceTimeframe}\n`);
  process.stdout.write(`Candles: ${artifact.rawCandleCount.toLocaleString()}\n`);
  process.stdout.write(`First: ${artifact.firstTimestamp ?? "n/a"}\n`);
  process.stdout.write(`Last: ${artifact.lastTimestamp ?? "n/a"}\n`);
  process.stdout.write(`Status: ${artifact.validationSummary.status}\n`);
  if (artifact.validationSummary.warnings.length) {
    process.stdout.write(`Warnings: ${artifact.validationSummary.warnings.map((warning) => warning.code).join(", ")}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
