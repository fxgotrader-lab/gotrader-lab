#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-session-narrative-90d-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol =
  process.env.MT5_READONLY_BROKER_SYMBOL ||
  process.env.MT5_READONLY_DEFAULT_SYMBOL ||
  "USTECH";
const timeframe = process.env.ICT_SESSION_NARRATIVE_90D_TIMEFRAME || "15m";
const requestedLookbackDays = Number(process.env.ICT_SESSION_NARRATIVE_90D_DAYS || 90);
const chunkDays = Number(process.env.ICT_SESSION_NARRATIVE_90D_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_SESSION_NARRATIVE_90D_LIMIT || 5000)));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);
const timingZone = process.env.ICT_SESSION_NARRATIVE_TIMING_ZONE || "America/New_York";

const sourceFiles = [
  "ictStrategySuiteTypes.ts",
  "ictAdvisorTypes.ts",
  "ictSessionNarrativeTypes.ts",
  "ictStrategySuiteHelpers.ts",
  "ictSessionNarrative.ts"
];

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesIncluded: false,
  rawSnapshotsIncluded: false,
  secretsIncluded: false,
  accountDataIncluded: false,
  orderDataIncluded: false,
  positionDataIncluded: false
};

const profileOrder = [
  "consolidation_manipulation_distribution",
  "accumulation_manipulation_expansion",
  "ny_session_reversal_to_premium_fvg",
  "ny_session_reversal_from_premium_to_discount",
  "trend_continuation",
  "range_bound",
  "insufficient_data",
  "unknown",
  "low_probability"
];

const eventOrder = [
  "bullish_expansion",
  "bearish_expansion",
  "ny_reversal_higher",
  "ny_reversal_lower"
];

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceRoot, file);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
        verbatimModuleSyntax: false
      },
      fileName: sourcePath
    }).outputText;
    const rewritten = transpiled
      .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'")
      .replace(/from\s+"..\/types"/g, 'from "./typesStub.mjs"')
      .replace(/from\s+'..\/types'/g, "from './typesStub.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
  fs.writeFileSync(path.join(outRoot, "typesStub.mjs"), "export {};\n", "utf8");
}

const endpoint = (pathName, params = {}) => {
  const url = new URL(`${bridgeUrl}/${pathName.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
};

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

const parseCandleTime = (candle) => {
  const parsed = Date.parse(candle?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle?.time) ? candle.time * 1000 : 0;
};

const normalizeCandles = (candles = []) => {
  const seen = new Set();
  return candles
    .filter(
      (candle) =>
        candle &&
        typeof candle === "object" &&
        Boolean(candle.timestamp) &&
        Number.isFinite(Number(candle.open)) &&
        Number.isFinite(Number(candle.high)) &&
        Number.isFinite(Number(candle.low)) &&
        Number.isFinite(Number(candle.close))
    )
    .sort((left, right) => parseCandleTime(left) - parseCandleTime(right))
    .filter((candle) => {
      const key = parseCandleTime(candle);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candle, index) => ({
      id: `mt5_90d_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
      symbol: requestedSymbol,
      timeframe,
      timestamp: candle.timestamp,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume ?? candle.tickVolume ?? candle.tick_volume ?? 0)
    }));
};

const round = (value, decimals = 2) => Number(value.toFixed(decimals));

const availableLookbackDaysFor = (firstTimestamp, lastTimestamp) => {
  const span = Date.parse(lastTimestamp) - Date.parse(firstTimestamp);
  return Number.isFinite(span) ? round(Math.max(0, span) / 86_400_000) : 0;
};

const classifyDepth = ({ candleCount, availableLookbackDays }) => {
  if (!candleCount || availableLookbackDays <= 0) return "unavailable";
  if (availableLookbackDays >= requestedLookbackDays * 0.8) return "sufficient";
  if (availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)) return "limited";
  return "insufficient";
};

async function fetchLatestAnchor() {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit: limitPerChunk
  }));
  if (!response.ok) throw new Error(`Latest MT5 candles unavailable: HTTP ${response.status}`);
  const candles = Array.isArray(response.payload?.candles) ? response.payload.candles : [];
  const lastTimestamp = response.payload?.lastTimestamp ?? candles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 candles did not include a last timestamp.");
  return { lastTimestamp };
}

const dateWindows = (endTimestamp) => {
  const end = Date.parse(endTimestamp);
  const start = end - requestedLookbackDays * 86_400_000;
  const chunkMillis = Math.max(1, chunkDays) * 86_400_000;
  const windows = [];
  let cursor = start;
  while (cursor < end && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end);
    windows.push({
      from: new Date(cursor).toISOString(),
      to: new Date(next).toISOString()
    });
    cursor = next;
  }
  return windows;
};

async function fetchChunkedCandles(endTimestamp) {
  const windows = dateWindows(endTimestamp);
  const chunks = [];
  const candleBuffer = [];
  for (const window of windows) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
    if (!response.ok) throw new Error(`Range MT5 candles unavailable: HTTP ${response.status}`);
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const candles = Array.isArray(payload.candles) ? payload.candles : [];
    chunks.push({
      from: window.from,
      to: window.to,
      returnedCount: Number(payload.returnedCount ?? candles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? payload.firstCandleTime ?? candles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? payload.lastCandleTime ?? candles.at(-1)?.timestamp,
      connectionStatus: payload.connectionStatus,
      depthStatus: payload.depthStatus,
      sourceMethod: payload.sourceMethod ?? payload.source,
      missingEvidence: payload.missingEvidence ?? []
    });
    candleBuffer.push(...candles);
  }
  return { chunks, candles: normalizeCandles(candleBuffer) };
}

const formatterCache = new Map();
const formatterFor = (timeZone) => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric"
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const localParts = (timestamp, timeZone = timingZone) => {
  const parts = formatterFor(timeZone).formatToParts(new Date(timestamp));
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour")) % 24;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour
  };
};

const addCalendarDay = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

const tradingDateFor = (timestamp) => {
  const parts = localParts(timestamp);
  return parts.hour >= 20 ? addCalendarDay(parts.date) : parts.date;
};

const emptyCountMap = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));

const pushExample = (map, key, tradingDate) => {
  if (!tradingDate) return;
  const examples = map[key] ?? [];
  if (!examples.includes(tradingDate) && examples.length < 5) examples.push(tradingDate);
  map[key] = examples;
};

function bestDetectedModel(narratives) {
  const candidates = narratives.filter(
    (item) => !["range_bound", "insufficient_data"].includes(item.profile) && item.confidence >= 0.45
  );
  const source = candidates.length ? candidates : narratives;
  const scores = new Map();
  for (const narrative of source) {
    const existing = scores.get(narrative.profile) ?? { count: 0, confidenceTotal: 0 };
    scores.set(narrative.profile, {
      count: existing.count + 1,
      confidenceTotal: existing.confidenceTotal + narrative.confidence
    });
  }
  return [...scores.entries()]
    .map(([profile, score]) => ({
      profile,
      count: score.count,
      averageConfidence: round(score.confidenceTotal / Math.max(1, score.count), 3)
    }))
    .sort((left, right) => right.count - left.count || right.averageConfidence - left.averageConfidence)[0];
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictSessionNarrative.mjs")));
  const { lastTimestamp } = await fetchLatestAnchor();
  const { chunks, candles } = await fetchChunkedCandles(lastTimestamp);
  const firstTimestamp = candles[0]?.timestamp;
  const effectiveLastTimestamp = candles.at(-1)?.timestamp;
  const availableLookbackDays = availableLookbackDaysFor(firstTimestamp, effectiveLastTimestamp);
  const dataDepthStatus = classifyDepth({ candleCount: candles.length, availableLookbackDays });

  const tradingDates = [...new Set(candles.map((candle) => tradingDateFor(candle.timestamp)))].sort();
  const narratives = [];
  for (const tradingDate of tradingDates) {
    const dayCount = candles.filter((candle) => tradingDateFor(candle.timestamp) === tradingDate).length;
    if (dayCount < 12) continue;
    const narrative = suite.buildIctSessionNarrative(candles, {
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe: timeframe,
      timingZone,
      requestedLookbackDays,
      availableLookbackDays,
      depthSource: "cached_depth",
      tradingDate
    });
    const compact = suite.assertIctSessionNarrativeIsCompact(narrative);
    assert.equal(compact.ok, true, `Narrative for ${tradingDate} must remain compact`);
    narratives.push({
      tradingDate,
      profile: narrative.profile,
      directionalRead: narrative.directionalRead,
      confidence: narrative.confidence,
      eventTypes: narrative.events.map((event) => event.eventType),
      dataDepthStatus: narrative.dataDepth.status,
      topReason: narrative.topReasons[0],
      noTradeReason: narrative.noTradeReasons[0]
    });
  }

  const profileCounts = emptyCountMap(profileOrder);
  const eventCounts = emptyCountMap(eventOrder);
  const exampleDates = {};
  const eventExampleDates = {};
  let sufficientDepthNarratives = 0;
  for (const narrative of narratives) {
    profileCounts[narrative.profile] = (profileCounts[narrative.profile] ?? 0) + 1;
    if (narrative.confidence < 0.45) profileCounts.low_probability += 1;
    if (narrative.dataDepthStatus === "sufficient") sufficientDepthNarratives += 1;
    pushExample(exampleDates, narrative.profile, narrative.tradingDate);
    for (const eventType of eventOrder) {
      if (narrative.eventTypes.includes(eventType)) {
        eventCounts[eventType] += 1;
        pushExample(eventExampleDates, eventType, narrative.tradingDate);
      }
    }
  }

  const result = {
    status: dataDepthStatus === "sufficient" && narratives.length ? "passed" : "limited",
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe,
      timingZone
    },
    dataDepth: {
      requestedLookbackDays,
      availableLookbackDays,
      candleCount: candles.length,
      completedChunkCount: chunks.length,
      firstCandleTime: firstTimestamp,
      lastCandleTime: effectiveLastTimestamp,
      dataDepthStatus,
      rangeEndpointAvailable: true
    },
    sessionNarrative: {
      tradingDaysEvaluated: narratives.length,
      sufficientDepthNarratives,
      profileCounts,
      expansionEventCounts: eventCounts,
      exampleDates,
      expansionExampleDates: eventExampleDates,
      bestDetectedSessionModel: bestDetectedModel(narratives),
      latestExamples: narratives.slice(-5)
    },
    safety,
    authority
  };

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "90-day narrative output must not expose raw candles");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    "90-day narrative output must not expose unsafe data"
  );
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`ICT 90-day session narrative verification failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
