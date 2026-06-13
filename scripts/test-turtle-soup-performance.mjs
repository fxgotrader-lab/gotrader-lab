#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "turtle-soup-performance-test");
const sourceFiles = ["ictTurtleSoupTypes.ts", "ictTurtleSoup.ts"];

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const requestedLookbackDays = Number(process.env.TURTLE_SOUP_LOOKBACK_DAYS || 90);
const entryTimeframe = "5m";
const setupTimeframe = process.env.TURTLE_SOUP_SETUP_TIMEFRAME || "15m";
const chunkDays = Number(process.env.TURTLE_SOUP_CHUNK_DAYS || 7);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.TURTLE_SOUP_CHUNK_LIMIT || 5000)));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 12000);
const entrySliceCandles = Number(process.env.TURTLE_SOUP_ENTRY_SLICE_CANDLES || 80);
const setupSliceCandles = Number(process.env.TURTLE_SOUP_SETUP_SLICE_CANDLES || 96);
const maxLookaheadCandles = Number(process.env.TURTLE_SOUP_LOOKAHEAD_CANDLES || 72);

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  secretsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  realOrderPlaced: false,
  brokerMutation: false
};

function compileForNode() {
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
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const average = (values) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? round(sorted[midpoint], 4) : round((sorted[midpoint - 1] + sorted[midpoint]) / 2, 4);
};
const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
};

const endpoint = (pathName, params = {}) => {
  const url = new URL(`${bridgeUrl}/${pathName.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
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
      payload: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text()
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

const normalizeMt5Candles = ({ candles = [], timeframe }) => {
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
      id: `mt5_turtle_soup_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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

const dateWindows = (endTimestamp) => {
  const end = Date.parse(endTimestamp);
  const start = end - requestedLookbackDays * 86_400_000;
  const chunkMillis = Math.max(1, chunkDays) * 86_400_000;
  const windows = [];
  let cursor = start;
  while (cursor < end && windows.length < 120) {
    const next = Math.min(cursor + chunkMillis, end);
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchLatestAnchorTimestamp() {
  const latest = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe: "5m",
    limit: 1000
  }));
  if (!latest.ok) throw new Error(`Latest MT5 anchor candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 anchor candles did not include a last timestamp.");
  return lastTimestamp;
}

async function fetchChunkedCandles(timeframe, anchorTimestamp) {
  const rawCandles = [];
  const chunks = [];
  for (const window of dateWindows(anchorTimestamp)) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
    if (!response.ok) throw new Error(`Range MT5 ${timeframe} candles returned HTTP ${response.status}`);
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    rawCandles.push(...chunkCandles);
    chunks.push({ from: window.from, to: window.to, returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0) });
  }
  const candles = normalizeMt5Candles({ candles: rawCandles, timeframe });
  return {
    timeframe,
    candles,
    chunks,
    candleCount: candles.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles.at(-1)?.timestamp,
    availableLookbackDays:
      candles[0]?.timestamp && candles.at(-1)?.timestamp
        ? round((Date.parse(candles.at(-1).timestamp) - Date.parse(candles[0].timestamp)) / 86_400_000, 2)
        : 0
  };
}

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const nyParts = (timestamp) => {
  const parts = Object.fromEntries(nyFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute ?? "0");
  return { dayKey: `${parts.year}-${parts.month}-${parts.day}`, minuteOfDay: hour * 60 + minute };
};

const sessionForMinute = (minuteOfDay) => {
  if (minuteOfDay >= 180 && minuteOfDay < 300) return "london_open";
  if (minuteOfDay >= 570 && minuteOfDay < 660) return "new_york_open";
  return undefined;
};

const tailAt = (candles, timestamp, limit) => {
  const cutoff = Date.parse(timestamp);
  let end = candles.findIndex((candle) => parseCandleTime(candle) > cutoff);
  if (end === -1) end = candles.length;
  return { slice: candles.slice(Math.max(0, end - limit), end), endIndex: end - 1 };
};

const simulateOutcome = ({ candles, candidate, signalIndex }) => {
  if (!candidate.canCreateValidationChainEntry || candidate.side === "flat") return "no_trade";
  const future = candles.slice(signalIndex + 1, signalIndex + 1 + maxLookaheadCandles);
  if (!future.length) return "insufficient_data";
  for (const candle of future) {
    if (candidate.side === "long") {
      const invalidationHit = candle.low <= candidate.stop;
      const targetHit = candle.high >= candidate.target;
      if (invalidationHit && targetHit) return "invalidation_first";
      if (targetHit) return "target_first";
      if (invalidationHit) return "invalidation_first";
    }
    if (candidate.side === "short") {
      const invalidationHit = candle.high >= candidate.stop;
      const targetHit = candle.low <= candidate.target;
      if (invalidationHit && targetHit) return "invalidation_first";
      if (targetHit) return "target_first";
      if (invalidationHit) return "invalidation_first";
    }
  }
  return "stalled";
};

const compactCandidate = ({ candidate, signalIndex, outcome, tradingDate, sessionId }) => ({
  key: [tradingDate, sessionId, candidate.side, candidate.sweep?.timestamp, candidate.marketStructureShift?.timestamp].join("|"),
  tradingDate,
  sessionId,
  side: candidate.side,
  outcome,
  rr: candidate.rr,
  signalIndex,
  blocker: candidate.blockers[0],
  canCreateValidationChainEntry: candidate.canCreateValidationChainEntry,
  authority: candidate.authority
});

const summarizeBasic = (candidates) => {
  const targetFirst = candidates.filter((candidate) => candidate.outcome === "target_first").length;
  const invalidationFirst = candidates.filter((candidate) => candidate.outcome === "invalidation_first").length;
  const stalled = candidates.filter((candidate) => candidate.outcome === "stalled").length;
  const rrValues = candidates.map((candidate) => candidate.rr).filter(Number.isFinite);
  return {
    count: candidates.length,
    targetFirst,
    invalidationFirst,
    stalled,
    targetFirstRate: candidates.length ? round(targetFirst / candidates.length, 4) : 0,
    invalidationFirstRate: candidates.length ? round(invalidationFirst / candidates.length, 4) : 0,
    averageRR: average(rrValues),
    medianRR: median(rrValues)
  };
};

const summarizeCandidates = (candidates) => ({
  ...summarizeBasic(candidates),
  uniqueTradingDates: Object.keys(countBy(candidates, (candidate) => candidate.tradingDate)).length,
  bySession: Object.fromEntries(["london_open", "new_york_open"].map((sessionId) => [sessionId, summarizeBasic(candidates.filter((candidate) => candidate.sessionId === sessionId))])),
  bySide: Object.fromEntries(["long", "short"].map((side) => [side, summarizeBasic(candidates.filter((candidate) => candidate.side === side))]))
});

const rollingWindows = (firstTimestamp, lastTimestamp) => {
  const start = Date.parse(firstTimestamp);
  const end = Date.parse(lastTimestamp);
  const windowMs = 30 * 86_400_000;
  const stepMs = 15 * 86_400_000;
  const windows = [];
  for (let cursor = start; cursor + windowMs <= end + 1; cursor += stepMs) {
    windows.push({ from: cursor, to: cursor + windowMs });
  }
  return windows;
};

const rollingSummary = ({ candidates, firstTimestamp, lastTimestamp }) => {
  const rows = rollingWindows(firstTimestamp, lastTimestamp).map((window, index) => {
    const scoped = candidates.filter((candidate) => {
      const value = Date.parse(`${candidate.tradingDate}T12:00:00.000Z`);
      return value >= window.from && value < window.to;
    });
    return { window: index + 1, from: new Date(window.from).toISOString().slice(0, 10), to: new Date(window.to).toISOString().slice(0, 10), ...summarizeBasic(scoped) };
  });
  return { windowCount: rows.length, activeRollingWindows: rows.filter((row) => row.count > 0).length, windows: rows };
};

const oosSummary = (candidates) => {
  if (candidates.length < 20) return { verdict: "insufficient_data", firstHalf: summarizeBasic([]), secondHalf: summarizeBasic([]) };
  const sorted = candidates.slice().sort((left, right) => left.key.localeCompare(right.key));
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = summarizeBasic(sorted.slice(0, midpoint));
  const secondHalf = summarizeBasic(sorted.slice(midpoint));
  const verdict =
    secondHalf.count < 5
      ? "insufficient_second_half"
      : secondHalf.targetFirstRate < 0.4 || secondHalf.targetFirstRate < firstHalf.targetFirstRate * 0.6
        ? "degraded"
        : "passed";
  return { verdict, firstHalf, secondHalf };
};

const classifyRobustness = ({ summary, rolling, oos }) => {
  if (summary.count < 20) return "needs_more_data";
  if (summary.uniqueTradingDates < 3 || rolling.activeRollingWindows < 2) return "overfit_risk";
  if (summary.averageRR < 2.5 || summary.medianRR < 2.5) return "research_only";
  if (oos.verdict === "degraded" || oos.verdict === "failed") return "rejected";
  if (summary.targetFirstRate >= 0.55 && summary.invalidationFirstRate <= 0.35) return "paper_watchlist_candidate";
  return "research_only";
};

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.equal(report.safety.realOrderPlaced, false);
  assert.equal(report.safety.brokerMutation, false);
};

async function main() {
  compileForNode();
  const { evaluateIctTurtleSoup } = await import(pathToFileURL(path.join(outRoot, "ictTurtleSoup.mjs")).href);
  const anchorTimestamp = await fetchLatestAnchorTimestamp();
  const [entryDepth, setupDepth] = await Promise.all([
    fetchChunkedCandles(entryTimeframe, anchorTimestamp),
    fetchChunkedCandles(setupTimeframe, anchorTimestamp)
  ]);
  const candidatesByKey = new Map();
  const diagnostics = { totalSessionEvaluations: 0, blocked: {} };
  for (let index = 0; index < entryDepth.candles.length; index += 1) {
    const candle = entryDepth.candles[index];
    const parts = nyParts(candle.timestamp);
    const sessionId = sessionForMinute(parts.minuteOfDay);
    if (!sessionId) continue;
    diagnostics.totalSessionEvaluations += 1;
    const entryTail = entryDepth.candles.slice(Math.max(0, index - entrySliceCandles), index + 1);
    const setupTail = tailAt(setupDepth.candles, candle.timestamp, setupSliceCandles).slice;
    const candidate = evaluateIctTurtleSoup({
      setupCandles: setupTail,
      entryCandles: entryTail,
      sourceProvider: "mt5_read_only",
      sourceFingerprint: `mt5|${requestedSymbol}|${brokerSymbol}|5m|${entryDepth.candleCount}`,
      requestedSymbol,
      brokerSymbol,
      setupTimeframe,
      entryTimeframe,
      newsEvents: [],
      generatedAt: candle.timestamp
    });
    if (!candidate.canCreateValidationChainEntry) {
      const reason = candidate.blockers[0] ?? candidate.missingConditions[0] ?? candidate.status;
      diagnostics.blocked[reason] = (diagnostics.blocked[reason] ?? 0) + 1;
      continue;
    }
    const outcome = simulateOutcome({ candles: entryDepth.candles, candidate, signalIndex: index });
    const compact = compactCandidate({ candidate, signalIndex: index, outcome, tradingDate: parts.dayKey, sessionId });
    if (!candidatesByKey.has(compact.key)) candidatesByKey.set(compact.key, compact);
  }
  const candidates = [...candidatesByKey.values()];
  const performance = summarizeCandidates(candidates);
  const rolling = rollingSummary({ candidates, firstTimestamp: entryDepth.firstTimestamp, lastTimestamp: entryDepth.lastTimestamp });
  const oos = oosSummary(candidates);
  const robustnessClassification = classifyRobustness({ summary: performance, rolling, oos });
  const promotionDecision =
    robustnessClassification === "paper_watchlist_candidate"
      ? "Turtle Soup may remain paper-watchlist research only; Paper-Demo still requires deterministic gates."
      : "Do not promote Turtle Soup; keep replay-required/research-only until independent-date and OOS evidence improve.";
  const report = {
    status: "passed",
    diagnostic: "turtle_soup_performance_90d",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      entryTimeframe,
      setupTimeframe,
      requestedLookbackDays,
      entry: {
        candleCount: entryDepth.candleCount,
        chunkCount: entryDepth.chunks.length,
        availableLookbackDays: entryDepth.availableLookbackDays,
        firstTimestamp: entryDepth.firstTimestamp,
        lastTimestamp: entryDepth.lastTimestamp,
        dataDepthStatus: entryDepth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited"
      },
      setup: {
        candleCount: setupDepth.candleCount,
        chunkCount: setupDepth.chunks.length,
        availableLookbackDays: setupDepth.availableLookbackDays,
        dataDepthStatus: setupDepth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited"
      },
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    detectorFunnel: {
      totalSessionEvaluations: diagnostics.totalSessionEvaluations,
      validCandidates: performance.count,
      topBlockers: Object.entries(diagnostics.blocked).map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count).slice(0, 8)
    },
    performance,
    rollingOos: { oosVerdict: oos.verdict, firstHalf: oos.firstHalf, secondHalf: oos.secondHalf, activeRollingWindows: rolling.activeRollingWindows, rollingWindowCount: rolling.windowCount, windows: rolling.windows },
    gates: {
      minimumUniqueDates: 3,
      minimumActiveRollingWindows: 2,
      minimumValidCandidates: 20,
      minimumRR: 2.5,
      noMockOrSampleSource: true,
      paperDemoBlockedIfOosDegrades: oos.verdict === "degraded" || oos.verdict === "failed"
    },
    robustnessClassification,
    promotionDecision,
    safety,
    authority
  };
  assertSafeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    status: "failed",
    diagnostic: "turtle_soup_performance_90d",
    error: error instanceof Error ? error.message : String(error),
    promotionDecision: "Do not promote Turtle Soup; diagnostic did not complete.",
    safety,
    authority
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
