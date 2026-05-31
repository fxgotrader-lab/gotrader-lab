import { mockCandles } from "@/lib/mockData/mockCandles";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";
import { uid } from "@/lib/utils";

export type HistoricalImportFormat = "csv" | "xlsx";
export type HistoricalImportStatus = "valid" | "valid_with_warnings" | "invalid";
export type CandleDataSourceMode = "mock" | "imported";

export interface HistoricalCandleValidationWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "blocking";
}

export interface ImportedCandleMetadata {
  importId: string;
  fileName: string;
  format: HistoricalImportFormat;
  sheetName?: string;
  sheetNames: string[];
  columnNames: string[];
  symbol: FuturesSymbol;
  contract?: string;
  timeframe?: Timeframe;
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  duplicateTimestampsHandled: number;
  missingIntervalsDetected: number;
  dominantIntervalMinutes?: number;
  validationWarnings: HistoricalCandleValidationWarning[];
  importedAt: string;
  status: HistoricalImportStatus;
  sourceLabel: string;
}

export interface HistoricalCandleImportResult {
  metadata: ImportedCandleMetadata;
  candles: Candle[];
}

export interface CandleDataSource {
  mode: CandleDataSourceMode;
  label: string;
  candles: Candle[];
  metadata?: ImportedCandleMetadata;
}

export type ImportedCandleActivationStatus =
  | "imported_active"
  | "imported_missing"
  | "active_import_missing_stale"
  | "mock_fallback";

export interface ImportedCandleActivationState {
  activeImportId?: string;
  imports: ImportedCandleMetadata[];
  activeMetadata?: ImportedCandleMetadata;
  activeCandlesAvailable: boolean;
  importedDatasetCount: number;
  status: ImportedCandleActivationStatus;
  message: string;
}

const DB_NAME = "gotrader-ai-lab-market-data";
const DB_VERSION = 1;
const IMPORTS_STORE = "imports";
const CANDLES_STORE = "candles";
const ACTIVE_IMPORT_KEY = "gotrader-ai-lab-active-candle-import-id";
export const MARKET_DATA_IMPORT_UPDATED_EVENT = "gotrader-ai-lab-market-data-import-updated";

const isBrowser = () => typeof window !== "undefined" && typeof indexedDB !== "undefined";
const textDecoder = new TextDecoder("utf-8");

const symbolOptions: FuturesSymbol[] = ["ES", "NQ", "MES", "MNQ"];
const timeframeOptions: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const columnLetterToIndex = (cellRef: string) => {
  const letters = cellRef.replace(/[0-9]/g, "");
  return letters.split("").reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const publishImportEvent = (detail?: unknown) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MARKET_DATA_IMPORT_UPDATED_EVENT, { detail }));
  }
};

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB is unavailable in this environment."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMPORTS_STORE)) {
        db.createObjectStore(IMPORTS_STORE, { keyPath: "importId" });
      }
      if (!db.objectStoreNames.contains(CANDLES_STORE)) {
        db.createObjectStore(CANDLES_STORE, { keyPath: "importId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open market data import store."));
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });

const idbRequest = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });

export async function saveImportedCandleSet(result: HistoricalCandleImportResult) {
  const db = await openDb();
  const tx = db.transaction([IMPORTS_STORE, CANDLES_STORE], "readwrite");
  tx.objectStore(IMPORTS_STORE).put(result.metadata);
  tx.objectStore(CANDLES_STORE).put({ importId: result.metadata.importId, candles: result.candles });
  await txDone(tx);
  db.close();
  publishImportEvent(result.metadata);
  return result.metadata;
}

export async function listImportedCandleMetadata(): Promise<ImportedCandleMetadata[]> {
  if (!isBrowser()) {
    return [];
  }
  const db = await openDb();
  const tx = db.transaction(IMPORTS_STORE, "readonly");
  const rows = await idbRequest<ImportedCandleMetadata[]>(tx.objectStore(IMPORTS_STORE).getAll());
  await txDone(tx);
  db.close();
  return rows.sort((a, b) => Date.parse(b.importedAt) - Date.parse(a.importedAt));
}

export async function loadImportedCandles(importId: string): Promise<Candle[]> {
  const db = await openDb();
  const tx = db.transaction(CANDLES_STORE, "readonly");
  const row = await idbRequest<{ importId: string; candles: Candle[] } | undefined>(tx.objectStore(CANDLES_STORE).get(importId));
  await txDone(tx);
  db.close();
  return row?.candles ?? [];
}

export function setActiveImportedCandleSet(importId?: string) {
  if (typeof window === "undefined") {
    return;
  }
  if (importId) {
    window.localStorage.setItem(ACTIVE_IMPORT_KEY, importId);
  } else {
    window.localStorage.removeItem(ACTIVE_IMPORT_KEY);
  }
  publishImportEvent({ activeImportId: importId });
}

export function getActiveImportedCandleSetId() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage.getItem(ACTIVE_IMPORT_KEY) ?? undefined;
}

export async function resolveImportedCandleActivationState(): Promise<ImportedCandleActivationState> {
  const activeImportId = getActiveImportedCandleSetId();
  const imports = await listImportedCandleMetadata();
  const activeMetadata = activeImportId ? imports.find((item) => item.importId === activeImportId) : undefined;
  const activeCandlesAvailable = activeMetadata ? (await loadImportedCandles(activeMetadata.importId)).length > 0 : false;

  if (activeMetadata && activeCandlesAvailable) {
    return {
      activeImportId,
      imports,
      activeMetadata,
      activeCandlesAvailable,
      importedDatasetCount: imports.length,
      status: "imported_active",
      message: `${activeMetadata.sourceLabel} is active for research.`
    };
  }

  if (activeImportId) {
    return {
      activeImportId,
      imports,
      activeMetadata,
      activeCandlesAvailable,
      importedDatasetCount: imports.length,
      status: "active_import_missing_stale",
      message: activeMetadata
        ? `Active import ${activeImportId} exists but its candle rows are missing. Reactivate another dataset or re-import the file.`
        : `Active import ${activeImportId} is stale or missing from IndexedDB. Reactivate a stored dataset or re-import the file.`
    };
  }

  if (imports.length) {
    return {
      imports,
      activeCandlesAvailable: false,
      importedDatasetCount: imports.length,
      status: "imported_missing",
      message: "Imported datasets exist in IndexedDB, but none is active. Reactivate one before imported-data research."
    };
  }

  return {
    imports,
    activeCandlesAvailable: false,
    importedDatasetCount: 0,
    status: "mock_fallback",
    message: "No imported historical datasets were found. Re-import MNQ data before comparing imported-data research."
  };
}

export async function loadActiveCandleSource(): Promise<CandleDataSource> {
  const activation = await resolveImportedCandleActivationState();
  if (activation.status !== "imported_active" || !activation.activeMetadata || !activation.activeImportId) {
    return {
      mode: "mock",
      label: "Mock candles",
      candles: mockCandles
    };
  }

  const metadata = activation.activeMetadata;
  const candles = await loadImportedCandles(activation.activeImportId);

  return {
    mode: "imported",
    label: `${metadata.symbol}${metadata.contract ? ` ${metadata.contract}` : ""} ${metadata.timeframe ?? "detected"} imported`,
    metadata,
    candles
  };
}

const parseCsvRows = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

const readUInt16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const readUInt32 = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

const inflateRaw = async (bytes: Uint8Array) => {
  const DecompressionStreamCtor = (globalThis as unknown as { DecompressionStream?: new (format: string) => DecompressionStream }).DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new Error("This browser cannot decompress .xlsx files. Use CSV export or a Chromium-based browser.");
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZipEntries = async (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (readUInt32(bytes, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Invalid .xlsx file: ZIP directory not found.");
  }

  const entryCount = readUInt16(bytes, eocdOffset + 10);
  let offset = readUInt32(bytes, eocdOffset + 16);
  const entries = new Map<string, Uint8Array>();

  for (let i = 0; i < entryCount; i++) {
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
    entries.set(fileName, method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : compressed);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const xmlDoc = (contents?: Uint8Array) => {
  if (!contents) {
    return undefined;
  }
  return new DOMParser().parseFromString(textDecoder.decode(contents), "application/xml");
};

const textOf = (element: Element | null | undefined) => element?.textContent ?? "";

const parseSharedStrings = (doc?: Document) => {
  if (!doc) {
    return [];
  }
  return Array.from(doc.getElementsByTagName("si")).map((si) =>
    Array.from(si.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("")
  );
};

const parseWorkbookSheets = (entries: Map<string, Uint8Array>) => {
  const workbookDoc = xmlDoc(entries.get("xl/workbook.xml"));
  const relsDoc = xmlDoc(entries.get("xl/_rels/workbook.xml.rels"));
  if (!workbookDoc || !relsDoc) {
    throw new Error("Invalid .xlsx file: workbook metadata is missing.");
  }
  const rels = new Map(
    Array.from(relsDoc.getElementsByTagName("Relationship")).map((rel) => [
      rel.getAttribute("Id") ?? "",
      rel.getAttribute("Target") ?? ""
    ])
  );
  return Array.from(workbookDoc.getElementsByTagName("sheet")).map((sheet) => {
    const relId = sheet.getAttribute("r:id") ?? "";
    const target = rels.get(relId) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^(\.\/)?/, "")}`;
    return {
      name: sheet.getAttribute("name") ?? "Sheet",
      path: path.replace(/\\/g, "/")
    };
  });
};

const parseSheetRows = (doc: Document, sharedStrings: string[]) => {
  const rows: unknown[][] = [];
  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const values: unknown[] = [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const ref = cell.getAttribute("r") ?? "";
      const index = columnLetterToIndex(ref);
      const type = cell.getAttribute("t");
      const valueText = textOf(cell.getElementsByTagName("v")[0]);
      const inlineText = textOf(cell.getElementsByTagName("t")[0]);
      let value: unknown = valueText;
      if (type === "s") {
        value = sharedStrings[Number(valueText)] ?? "";
      } else if (type === "inlineStr") {
        value = inlineText;
      } else if (valueText !== "" && Number.isFinite(Number(valueText))) {
        value = Number(valueText);
      }
      values[index] = value;
    }
    if (values.some((value) => value !== undefined && value !== "")) {
      rows.push(values);
    }
  }
  return rows;
};

const parseXlsxRows = async (buffer: ArrayBuffer) => {
  const entries = await readZipEntries(buffer);
  const sheets = parseWorkbookSheets(entries);
  const sharedStrings = parseSharedStrings(xmlDoc(entries.get("xl/sharedStrings.xml")));
  const parsedSheets = sheets.map((sheet) => ({
    name: sheet.name,
    rows: parseSheetRows(xmlDoc(entries.get(sheet.path)) ?? new DOMParser().parseFromString("<worksheet />", "application/xml"), sharedStrings)
  }));
  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets: parsedSheets
  };
};

const detectSymbolContract = (fileName: string, fallbackSymbol: FuturesSymbol) => {
  const match = fileName.toUpperCase().match(/\b(ES|NQ|MES|MNQ)[_\s-]*(\d{2}-\d{2})?/);
  return {
    symbol: (match?.[1] && symbolOptions.includes(match[1] as FuturesSymbol) ? match[1] : fallbackSymbol) as FuturesSymbol,
    contract: match?.[2]
  };
};

const excelSerialDate = (serial: number) => {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000);
};

const valueAsDatePart = (value: unknown) => {
  if (typeof value === "number") {
    return excelSerialDate(value).toISOString().slice(0, 10);
  }
  return String(value ?? "").trim();
};

const valueAsTimePart = (value: unknown) => {
  if (typeof value === "number") {
    const totalSeconds = Math.round((value % 1) * 86400);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }
  return String(value ?? "").trim();
};

const parseTimestamp = (timestampValue: unknown, dateValue: unknown, timeValue: unknown) => {
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

const detectTimeframe = (minutes?: number): Timeframe | undefined => {
  if (!minutes) {
    return undefined;
  }
  if (minutes <= 1.5) return "1m";
  if (Math.abs(minutes - 5) <= 1) return "5m";
  if (Math.abs(minutes - 15) <= 2) return "15m";
  if (Math.abs(minutes - 60) <= 5) return "1h";
  if (Math.abs(minutes - 240) <= 10) return "4h";
  if (minutes >= 1200) return "1d";
  return undefined;
};

const indexFor = (headers: unknown[], aliases: string[]) => {
  const normalized = headers.map(normalizeHeader);
  return aliases.map(normalizeHeader).map((alias) => normalized.indexOf(alias)).find((index) => index >= 0);
};

const normalizeRowsToCandles = ({
  rows,
  fileName,
  sheetName,
  sheetNames,
  format,
  fallbackSymbol
}: {
  rows: unknown[][];
  fileName: string;
  sheetName?: string;
  sheetNames: string[];
  format: HistoricalImportFormat;
  fallbackSymbol: FuturesSymbol;
}): HistoricalCandleImportResult => {
  const warnings: HistoricalCandleValidationWarning[] = [];
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

  const seen = new Set<string>();
  const invalidRows: number[] = [];
  const timestampFailures: number[] = [];
  let duplicateTimestampsHandled = 0;
  const { symbol, contract } = detectSymbolContract(fileName, fallbackSymbol);
  const candles: Candle[] = [];

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

    const open = Number(row[openIndex as number]);
    const high = Number(row[highIndex as number]);
    const low = Number(row[lowIndex as number]);
    const close = Number(row[closeIndex as number]);
    const volume = volumeIndex !== undefined ? Number(row[volumeIndex]) : undefined;

    if (![open, high, low, close].every(Number.isFinite)) {
      invalidRows.push(index + headerRowIndex + 2);
      return;
    }
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      invalidRows.push(index + headerRowIndex + 2);
      return;
    }
    if (seen.has(timestamp)) {
      duplicateTimestampsHandled += 1;
      return;
    }
    seen.add(timestamp);
    candles.push({
      id: `${symbol}_${timestamp}`,
      symbol,
      timeframe: "1m",
      timestamp,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined
    });
  });

  candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const intervalCounts = new Map<number, number>();
  const largeGaps: Array<{ from: string; to: string; minutes: number }> = [];
  let missingIntervalsDetected = 0;
  for (let i = 1; i < candles.length; i++) {
    const deltaMinutes = Math.round((Date.parse(candles[i].timestamp) - Date.parse(candles[i - 1].timestamp)) / 60000);
    intervalCounts.set(deltaMinutes, (intervalCounts.get(deltaMinutes) ?? 0) + 1);
  }
  const dominantIntervalMinutes = [...intervalCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (dominantIntervalMinutes) {
    for (let i = 1; i < candles.length; i++) {
      const deltaMinutes = Math.round((Date.parse(candles[i].timestamp) - Date.parse(candles[i - 1].timestamp)) / 60000);
      if (deltaMinutes > dominantIntervalMinutes * 1.5) {
        missingIntervalsDetected += Math.max(0, Math.round(deltaMinutes / dominantIntervalMinutes) - 1);
        if (largeGaps.length < 5) {
          largeGaps.push({ from: candles[i - 1].timestamp, to: candles[i].timestamp, minutes: deltaMinutes });
        }
      }
    }
  }
  const timeframe = detectTimeframe(dominantIntervalMinutes);
  const normalizedCandles = candles.map((candle) => ({ ...candle, timeframe: timeframe ?? "1m" }));

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
      message: `${missingIntervalsDetected} expected ${dominantIntervalMinutes ?? "detected"}-minute interval(s) are missing. First gaps: ${largeGaps.map((gap) => `${gap.from} to ${gap.to}`).join("; ")}.`,
      severity: "warning"
    });
  }
  if (!timeframe) {
    warnings.push({
      code: "timeframe_not_detected",
      message: "Dominant candle interval could not be mapped to 1m, 5m, 15m, 1h, 4h, or 1d.",
      severity: "warning"
    });
  }

  const blocking = warnings.some((warning) => warning.severity === "blocking");
  const metadata: ImportedCandleMetadata = {
    importId: uid("candle_import"),
    fileName,
    format,
    sheetName,
    sheetNames,
    columnNames: headers.map((header) => String(header ?? "")),
    symbol,
    contract,
    timeframe,
    candleCount: normalizedCandles.length,
    firstTimestamp: normalizedCandles[0]?.timestamp,
    lastTimestamp: normalizedCandles[normalizedCandles.length - 1]?.timestamp,
    duplicateTimestampsHandled,
    missingIntervalsDetected,
    dominantIntervalMinutes,
    validationWarnings: warnings,
    importedAt: new Date().toISOString(),
    status: blocking ? "invalid" : warnings.length ? "valid_with_warnings" : "valid",
    sourceLabel: `${symbol}${contract ? ` ${contract}` : ""} ${timeframe ?? "detected"} ${format.toUpperCase()}`
  };

  return { metadata, candles: normalizedCandles };
};

export async function importHistoricalCandleFile(file: File, fallbackSymbol: FuturesSymbol = "MNQ"): Promise<HistoricalCandleImportResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    const rows = parseCsvRows(await file.text());
    return normalizeRowsToCandles({
      rows,
      fileName: file.name,
      sheetName: "CSV import",
      sheetNames: ["CSV import"],
      format: "csv",
      fallbackSymbol
    });
  }
  if (extension === "xlsx") {
    const parsed = await parseXlsxRows(await file.arrayBuffer());
    const candidate =
      parsed.sheets.find((sheet) => {
        const headers = sheet.rows[0]?.map(normalizeHeader) ?? [];
        return headers.includes("open") && headers.includes("high") && headers.includes("low") && headers.includes("close");
      }) ?? parsed.sheets[0];
    return normalizeRowsToCandles({
      rows: candidate.rows,
      fileName: file.name,
      sheetName: candidate.name,
      sheetNames: parsed.sheetNames,
      format: "xlsx",
      fallbackSymbol
    });
  }
  throw new Error("Unsupported file type. Import .xlsx or .csv historical OHLCV files.");
}

export const isImportedCandleSource = (source: CandleDataSource) => source.mode === "imported" && Boolean(source.metadata);
