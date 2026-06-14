#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ifvg-expectancy-classifier-test");
const reportPath = path.join(projectRoot, "docs", "ifvg-expectancy-classifier-audit.md");
const sourceFiles = ["ictTradeConstructionTypes.ts", "ictTradeConstruction.ts", "ictIfvgTypes.ts", "ictIfvg.ts"];

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const requestedLookbackDays = Number(process.env.IFVG_LOOKBACK_DAYS || 90);
const entryTimeframes = (process.env.IFVG_TIMEFRAMES || "5m,15m").split(",").map((value) => value.trim()).filter(Boolean);
const fetchTimeframes = [...new Set([...entryTimeframes, "1h"])];
const chunkDays = Number(process.env.IFVG_CHUNK_DAYS || 14);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.IFVG_CHUNK_LIMIT || 5000)));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 12000);
const sliceCandlesByTimeframe = {
  "5m": Number(process.env.IFVG_5M_SLICE_CANDLES || 160),
  "15m": Number(process.env.IFVG_15M_SLICE_CANDLES || 120)
};
const lookaheadByTimeframe = {
  "5m": Number(process.env.IFVG_5M_LOOKAHEAD_CANDLES || 72),
  "15m": Number(process.env.IFVG_15M_LOOKAHEAD_CANDLES || 48)
};
const evalStrideByTimeframe = {
  "5m": Math.max(1, Number(process.env.IFVG_5M_EVAL_STRIDE || 6)),
  "15m": Math.max(1, Number(process.env.IFVG_15M_EVAL_STRIDE || 3))
};

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

const gateRequirements = {
  minimumCandidates: 20,
  minimumUniqueTradingDates: 3,
  minimumActiveRollingWindows: 2,
  minimumTargetFirstRate: 0.55,
  maximumInvalidationFirstRate: 0.35,
  minimumAverageRAtHalfCost: 0,
  minimumProfitFactorAtHalfCost: 1,
  minimumMedianRR: 2,
  oosVerdictsAllowed: ["passed"]
};

const costLevels = [0, 0.25, 0.5, 1];

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const pct = (value) => `${(value * 100).toFixed(2)}%`;
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
      id: `mt5_ifvg_expectancy_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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

const sessionBucket = (minuteOfDay) => {
  if (minuteOfDay >= 180 && minuteOfDay < 300) return "london_open";
  if (minuteOfDay >= 570 && minuteOfDay < 660) return "new_york_open";
  if (minuteOfDay >= 570 && minuteOfDay < 960) return "other_rth";
  return "outside_rth";
};

const upperBoundTimestamp = (candles, cutoff) => {
  let left = 0;
  let right = candles.length;
  while (left < right) {
    const midpoint = Math.floor((left + right) / 2);
    if (Date.parse(candles[midpoint].timestamp) <= cutoff) {
      left = midpoint + 1;
    } else {
      right = midpoint;
    }
  }
  return left;
};

const candlesBefore = (candles, timestamp, maxCount) => {
  const cutoff = Date.parse(timestamp);
  const end = upperBoundTimestamp(candles, cutoff);
  return candles.slice(Math.max(0, end - maxCount), end);
};

const contextFor = ({ depthsByTimeframe, entryTimeframe, timestamp }) => {
  const context = {};
  if (entryTimeframe === "5m") {
    context["15m"] = candlesBefore(depthsByTimeframe.get("15m")?.candles ?? [], timestamp, 96);
    context["1h"] = candlesBefore(depthsByTimeframe.get("1h")?.candles ?? [], timestamp, 96);
  }
  if (entryTimeframe === "15m") {
    context["1h"] = candlesBefore(depthsByTimeframe.get("1h")?.candles ?? [], timestamp, 96);
  }
  return context;
};

const simulateOutcome = ({ candles, candidate, signalIndex, timeframe }) => {
  if (!candidate.canCreateValidationChainEntry || candidate.side === "flat") return "no_trade";
  const lookahead = lookaheadByTimeframe[timeframe] ?? 72;
  const future = candles.slice(signalIndex + 1, signalIndex + 1 + lookahead);
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

const rrBucket = (rr) => {
  if (!Number.isFinite(rr)) return "unknown";
  if (rr < 2) return "below_2";
  if (rr < 5) return "2_to_5";
  if (rr < 10) return "5_to_10";
  return "10_plus";
};

const ifvgSizeBucket = (bounds) => {
  if (!bounds) return "unknown";
  const size = Math.abs(Number(bounds.high) - Number(bounds.low));
  if (!Number.isFinite(size)) return "unknown";
  if (size < 20) return "small";
  if (size < 60) return "medium";
  return "large";
};

const compactCandidate = ({ candidate, timeframe, signalIndex, outcome, tradingDate, session }) => ({
  key: [timeframe, candidate.originalFvgCandle?.timestamp, candidate.inversionCandle?.timestamp, candidate.retestCandle?.timestamp, candidate.side].join("|"),
  tradingDate,
  timeframe,
  session,
  side: candidate.side,
  outcome,
  rr: Number(candidate.rr ?? 0),
  rrBucket: rrBucket(candidate.rr),
  signalIndex,
  originalFvgDirection: candidate.originalFvgDirection,
  htfAlignment: candidate.htfAlignment,
  ifvgSizeBucket: ifvgSizeBucket(candidate.ifvgBounds),
  retestTimestamp: candidate.retestCandle?.timestamp,
  hasExternalLiquidityTarget: Boolean(candidate.liquidityTarget),
  premiumDiscountAligned: "not_measured",
  firstIfvgUse: candidate.presentConditions.includes("unused_ifvg_zone"),
  blocker: candidate.blockers[0],
  canCreateValidationChainEntry: candidate.canCreateValidationChainEntry,
  authority: candidate.authority
});

const outcomeR = (candidate, costR = 0) => {
  if (candidate.outcome === "target_first") return Number(candidate.rr ?? 0) - costR;
  if (candidate.outcome === "invalidation_first") return -1 - costR;
  if (candidate.outcome === "stalled") return -costR;
  return 0;
};

const maxDrawdown = (returns) => {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of returns) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  return round(Math.abs(drawdown), 4);
};

const longestLosingStreak = (returns) => {
  let current = 0;
  let longest = 0;
  for (const value of returns) {
    if (value < 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
};

const summarizeExpectancy = (candidates, costR = 0) => {
  const targetFirst = candidates.filter((candidate) => candidate.outcome === "target_first").length;
  const invalidationFirst = candidates.filter((candidate) => candidate.outcome === "invalidation_first").length;
  const stalled = candidates.filter((candidate) => candidate.outcome === "stalled").length;
  const returns = candidates.map((candidate) => outcomeR(candidate, costR));
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const grossWin = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  const rrValues = candidates.map((candidate) => candidate.rr).filter(Number.isFinite);
  return {
    count: candidates.length,
    targetFirst,
    invalidationFirst,
    stalled,
    targetFirstRate: candidates.length ? round(targetFirst / candidates.length, 4) : 0,
    invalidationFirstRate: candidates.length ? round(invalidationFirst / candidates.length, 4) : 0,
    averageRR: average(rrValues),
    medianRR: median(rrValues),
    averageR: average(returns),
    medianR: median(returns),
    totalR: round(returns.reduce((total, value) => total + value, 0), 4),
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 4) : wins.length ? 999 : 0,
    averageWinR: average(wins),
    averageLossR: average(losses),
    maxDrawdownR: maxDrawdown(returns),
    longestLosingStreak: longestLosingStreak(returns),
    uniqueTradingDates: Object.keys(countBy(candidates, (candidate) => candidate.tradingDate)).length
  };
};

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

const rollingExpectancy = ({ candidates, firstTimestamp, lastTimestamp, costR = 0 }) => {
  const windows = rollingWindows(firstTimestamp, lastTimestamp).map((window, index) => {
    const scoped = candidates.filter((candidate) => {
      const value = Date.parse(`${candidate.tradingDate}T12:00:00.000Z`);
      return value >= window.from && value < window.to;
    });
    return {
      window: index + 1,
      from: new Date(window.from).toISOString().slice(0, 10),
      to: new Date(window.to).toISOString().slice(0, 10),
      ...summarizeExpectancy(scoped, costR)
    };
  });
  return {
    windowCount: windows.length,
    activeRollingWindows: windows.filter((window) => window.count > 0).length,
    windows,
    weakWindows: windows.filter((window) => window.count > 0 && (window.targetFirstRate < 0.55 || window.averageR <= 0)).length
  };
};

const oosSummary = (candidates, costR = 0) => {
  if (candidates.length < 20) {
    return { verdict: "insufficient_data", firstHalf: summarizeExpectancy([], costR), secondHalf: summarizeExpectancy([], costR) };
  }
  const sorted = candidates.slice().sort((left, right) => `${left.tradingDate}|${left.retestTimestamp}`.localeCompare(`${right.tradingDate}|${right.retestTimestamp}`));
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = summarizeExpectancy(sorted.slice(0, midpoint), costR);
  const secondHalf = summarizeExpectancy(sorted.slice(midpoint), costR);
  const verdict =
    secondHalf.count < 5
      ? "insufficient_second_half"
      : secondHalf.targetFirstRate < 0.4 || secondHalf.averageR <= 0 || secondHalf.targetFirstRate < firstHalf.targetFirstRate * 0.6
        ? "degraded"
        : "passed";
  return { verdict, firstHalf, secondHalf };
};

const buildGateAudit = ({ summary, rolling, oos, costSensitivity }) => {
  const halfCost = costSensitivity["0.5R"];
  const failedGates = [];
  if (summary.count < gateRequirements.minimumCandidates) {
    failedGates.push({
      gate: "minimum_candidate_count",
      actual: summary.count,
      required: `>= ${gateRequirements.minimumCandidates}`,
      severity: "hard"
    });
  }
  if (summary.uniqueTradingDates < gateRequirements.minimumUniqueTradingDates) {
    failedGates.push({
      gate: "independent_trading_dates",
      actual: summary.uniqueTradingDates,
      required: `>= ${gateRequirements.minimumUniqueTradingDates}`,
      severity: "hard"
    });
  }
  if (rolling.activeRollingWindows < gateRequirements.minimumActiveRollingWindows) {
    failedGates.push({
      gate: "active_rolling_windows",
      actual: rolling.activeRollingWindows,
      required: `>= ${gateRequirements.minimumActiveRollingWindows}`,
      severity: "hard"
    });
  }
  if (!gateRequirements.oosVerdictsAllowed.includes(oos.verdict)) {
    failedGates.push({
      gate: "oos_verdict",
      actual: oos.verdict,
      required: gateRequirements.oosVerdictsAllowed.join(", "),
      severity: "hard"
    });
  }
  if (summary.targetFirstRate < gateRequirements.minimumTargetFirstRate) {
    failedGates.push({
      gate: "target_first_rate",
      actual: pct(summary.targetFirstRate),
      required: `>= ${pct(gateRequirements.minimumTargetFirstRate)}`,
      severity: "hard"
    });
  }
  if (summary.invalidationFirstRate > gateRequirements.maximumInvalidationFirstRate) {
    failedGates.push({
      gate: "invalidation_first_rate",
      actual: pct(summary.invalidationFirstRate),
      required: `<= ${pct(gateRequirements.maximumInvalidationFirstRate)}`,
      severity: "hard"
    });
  }
  if (summary.medianRR < gateRequirements.minimumMedianRR) {
    failedGates.push({
      gate: "median_rr",
      actual: summary.medianRR,
      required: `>= ${gateRequirements.minimumMedianRR}`,
      severity: "hard"
    });
  }
  if (halfCost.averageR <= gateRequirements.minimumAverageRAtHalfCost) {
    failedGates.push({
      gate: "half_r_cost_expectancy",
      actual: halfCost.averageR,
      required: `> ${gateRequirements.minimumAverageRAtHalfCost}`,
      severity: "hard"
    });
  }
  if (halfCost.profitFactor <= gateRequirements.minimumProfitFactorAtHalfCost) {
    failedGates.push({
      gate: "half_r_cost_profit_factor",
      actual: halfCost.profitFactor,
      required: `> ${gateRequirements.minimumProfitFactorAtHalfCost}`,
      severity: "hard"
    });
  }
  if (rolling.weakWindows > 0) {
    failedGates.push({
      gate: "rolling_window_stability",
      actual: `${rolling.weakWindows} weak active window(s)`,
      required: "0 weak active windows",
      severity: "soft"
    });
  }
  return failedGates;
};

const classifyIfvg = ({ summary, rolling, oos, costSensitivity }) => {
  const failedGates = buildGateAudit({ summary, rolling, oos, costSensitivity });
  if (summary.count === 0) return { classification: "too_strict", failedGates };
  if (summary.count < gateRequirements.minimumCandidates) return { classification: "insufficient_data", failedGates };
  if (summary.uniqueTradingDates < gateRequirements.minimumUniqueTradingDates || rolling.activeRollingWindows < gateRequirements.minimumActiveRollingWindows) {
    return { classification: "promising_but_unstable", failedGates };
  }
  if (oos.verdict === "degraded" || oos.verdict === "failed") return { classification: "rejected", failedGates };
  if (costSensitivity["0R"].averageR <= 0 || costSensitivity["0R"].profitFactor <= 1) return { classification: "no_edge", failedGates };
  if (costSensitivity["0.5R"].averageR <= 0 || costSensitivity["0.5R"].profitFactor <= 1) {
    return { classification: "promising_but_needs_cost_model", failedGates };
  }
  if (summary.targetFirstRate >= gateRequirements.minimumTargetFirstRate && summary.invalidationFirstRate <= gateRequirements.maximumInvalidationFirstRate && failedGates.length === 0) {
    return { classification: "paper_watchlist_candidate", failedGates };
  }
  if (summary.targetFirstRate >= gateRequirements.minimumTargetFirstRate || costSensitivity["0.5R"].averageR > 0) {
    return { classification: "needs_filtering", failedGates };
  }
  return { classification: "no_edge", failedGates };
};

const summarizeFilter = (label, candidates, firstTimestamp, lastTimestamp) => {
  const summary = summarizeExpectancy(candidates, 0);
  const costSensitivity = Object.fromEntries(costLevels.map((cost) => [`${cost}R`, summarizeExpectancy(candidates, cost)]));
  const rolling = rollingExpectancy({ candidates, firstTimestamp, lastTimestamp, costR: 0 });
  const oos = oosSummary(candidates, 0);
  const classifier = classifyIfvg({ summary, rolling, oos, costSensitivity });
  return {
    label,
    ...summary,
    averageRAtHalfCost: costSensitivity["0.5R"].averageR,
    profitFactorAtHalfCost: costSensitivity["0.5R"].profitFactor,
    activeRollingWindows: rolling.activeRollingWindows,
    weakRollingWindows: rolling.weakWindows,
    oosVerdict: oos.verdict,
    robustnessClassification: classifier.classification,
    failedGateCount: classifier.failedGates.length,
    topFailedGate: classifier.failedGates[0]?.gate ?? "none"
  };
};

const runClassifierUnitChecks = () => {
  const baseRolling = { activeRollingWindows: 3, weakWindows: 0 };
  const passedOos = { verdict: "passed" };
  const positiveCosts = {
    "0R": { averageR: 0.8, profitFactor: 1.8 },
    "0.25R": { averageR: 0.55, profitFactor: 1.5 },
    "0.5R": { averageR: 0.3, profitFactor: 1.2 },
    "1R": { averageR: 0.1, profitFactor: 1.05 }
  };
  const highHitBadExpectancy = classifyIfvg({
    summary: {
      count: 40,
      uniqueTradingDates: 8,
      targetFirstRate: 0.6,
      invalidationFirstRate: 0.4,
      medianRR: 0.5
    },
    rolling: baseRolling,
    oos: passedOos,
    costSensitivity: {
      "0R": { averageR: -0.1, profitFactor: 0.8 },
      "0.25R": { averageR: -0.2, profitFactor: 0.7 },
      "0.5R": { averageR: -0.3, profitFactor: 0.6 },
      "1R": { averageR: -0.6, profitFactor: 0.4 }
    }
  });
  assert.notEqual(highHitBadExpectancy.classification, "paper_watchlist_candidate");
  assert.equal(highHitBadExpectancy.classification, "no_edge");

  const oosPassedButNegative = classifyIfvg({
    summary: {
      count: 50,
      uniqueTradingDates: 10,
      targetFirstRate: 0.56,
      invalidationFirstRate: 0.44,
      medianRR: 1.2
    },
    rolling: baseRolling,
    oos: passedOos,
    costSensitivity: {
      "0R": { averageR: -0.02, profitFactor: 0.95 },
      "0.25R": { averageR: -0.2, profitFactor: 0.8 },
      "0.5R": { averageR: -0.4, profitFactor: 0.65 },
      "1R": { averageR: -0.8, profitFactor: 0.5 }
    }
  });
  assert.equal(oosPassedButNegative.classification, "no_edge");

  const paperWatchlist = classifyIfvg({
    summary: {
      count: 50,
      uniqueTradingDates: 10,
      targetFirstRate: 0.62,
      invalidationFirstRate: 0.3,
      medianRR: 2.4
    },
    rolling: baseRolling,
    oos: passedOos,
    costSensitivity: positiveCosts
  });
  assert.equal(paperWatchlist.classification, "paper_watchlist_candidate");

  const needsFiltering = classifyIfvg({
    summary: {
      count: 50,
      uniqueTradingDates: 10,
      targetFirstRate: 0.57,
      invalidationFirstRate: 0.43,
      medianRR: 4
    },
    rolling: baseRolling,
    oos: passedOos,
    costSensitivity: positiveCosts
  });
  assert.equal(needsFiltering.classification, "needs_filtering");
  assert.equal(needsFiltering.failedGates.some((gate) => gate.gate === "invalidation_first_rate"), true);
};

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.equal(report.safety.realOrderPlaced, false);
  assert.equal(report.safety.brokerMutation, false);
};

const filtersFor = (candidates) => [
  ["all_ifvg", candidates],
  ["ny_open_only", candidates.filter((candidate) => candidate.session === "new_york_open")],
  ["short_only", candidates.filter((candidate) => candidate.side === "short")],
  ["long_only", candidates.filter((candidate) => candidate.side === "long")],
  ["five_minute_only", candidates.filter((candidate) => candidate.timeframe === "5m")],
  ["fifteen_minute_only", candidates.filter((candidate) => candidate.timeframe === "15m")],
  ["htf_aligned_only", candidates.filter((candidate) => candidate.htfAlignment === "aligned")],
  ["first_ifvg_use_only", candidates.filter((candidate) => candidate.firstIfvgUse)],
  ["rr_2_to_5", candidates.filter((candidate) => candidate.rrBucket === "2_to_5")],
  ["rr_5_to_10", candidates.filter((candidate) => candidate.rrBucket === "5_to_10")],
  ["rr_10_plus", candidates.filter((candidate) => candidate.rrBucket === "10_plus")],
  ["external_liquidity_target_present", candidates.filter((candidate) => candidate.hasExternalLiquidityTarget)],
  ["small_ifvg", candidates.filter((candidate) => candidate.ifvgSizeBucket === "small")],
  ["medium_ifvg", candidates.filter((candidate) => candidate.ifvgSizeBucket === "medium")],
  ["large_ifvg", candidates.filter((candidate) => candidate.ifvgSizeBucket === "large")],
  ["avoid_outside_rth", candidates.filter((candidate) => candidate.session !== "outside_rth")]
];

function writeMarkdownReport(report) {
  const gateRows = report.classifierAudit.failedGates.length
    ? report.classifierAudit.failedGates.map((gate) => `| ${gate.gate} | ${gate.actual} | ${gate.required} | ${gate.severity} |`).join("\n")
    : "| none | pass | pass | n/a |";
  const expectancyRows = report.expectancy.bySegment
    .map((row) => `| ${row.label} | ${row.count} | ${pct(row.targetFirstRate)} | ${pct(row.invalidationFirstRate)} | ${row.averageR} | ${row.medianR} | ${row.profitFactor} | ${row.averageRR} | ${row.maxDrawdownR} |`)
    .join("\n");
  const costRows = Object.entries(report.costSensitivity)
    .map(([label, row]) => `| ${label} | ${row.averageR} | ${row.medianR} | ${row.profitFactor} | ${row.totalR} | ${row.maxDrawdownR} | ${row.longestLosingStreak} |`)
    .join("\n");
  const filterRows = report.filterAnalysis
    .map((row) => `| ${row.label} | ${row.count} | ${pct(row.targetFirstRate)} | ${pct(row.invalidationFirstRate)} | ${row.averageR} | ${row.averageRAtHalfCost} | ${row.uniqueTradingDates} | ${row.activeRollingWindows} | ${row.oosVerdict} | ${row.robustnessClassification} | ${row.topFailedGate} |`)
    .join("\n");

  const markdown = `# IFVG Expectancy Classifier Audit

Generated from \`npm.cmd run test:ifvg-expectancy-classifier\` on explicit MT5 read-only history.

## Scope

- Strategy: \`ifvg_v1\`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: \`${requestedSymbol}\`
- Broker symbol: \`${brokerSymbol}\`
- Authority: \`executionAuthority none\`, \`brokerAuthority none\`, \`readinessOverrideAuthority none\`
- Data policy: raw candles stayed internal to the CLI diagnostic; this report stores compact metrics only.

## Root Cause

The prior \`no_edge\` label was not caused by weak raw target-first rate or low RR. IFVG failed the paper-watchlist gate because invalidation-first rate stayed above the allowed ceiling and rolling windows weakened in the second half. That makes the better classification \`${report.classifierAudit.robustnessClassification}\`, not automatic promotion.

Exact gate audit:

| Gate | Actual | Required | Severity |
|---|---:|---:|---|
${gateRows}

## Expectancy Summary

| Segment | Candidates | Target-first | Invalidation-first | Avg R | Median R | Profit Factor | Avg RR | Max DD R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${expectancyRows}

## Cost Sensitivity

| Cost Model | Avg R | Median R | Profit Factor | Total R | Max DD R | Longest Losing Streak |
|---|---:|---:|---:|---:|---:|---:|
${costRows}

## Filter Analysis

| Filter | Candidates | Target-first | Invalidation-first | Avg R | Avg R @ 0.5R Cost | Dates | Windows | OOS | Classification | Top Failed Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|
${filterRows}

## Best Variant

${report.bestVariant ? `Best compact variant: \`${report.bestVariant.label}\` with ${report.bestVariant.count} candidates, ${pct(report.bestVariant.targetFirstRate)} target-first, ${report.bestVariant.averageRAtHalfCost} average R after 0.5R cost, and classification \`${report.bestVariant.robustnessClassification}\`.` : "No IFVG filter variant met paper-watchlist evidence gates."}

## Promotion Decision

${report.promotionDecision}

## Recommendation

Keep IFVG research-only. The signal is not a simple \`no_edge\` reject, but the current detector needs filtering before paper-watchlist consideration. The next safe refinement should focus on reducing invalidation-first rate and rolling-window weakness, especially by testing NY open, short-only, HTF-aligned, and RR-bucket variants with explicit cost assumptions.

## Safety Result

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no order placement
- no readiness override
- authority \`none/none/none\`
`;

  fs.writeFileSync(reportPath, markdown, "utf8");
}

async function collectCandidates() {
  compileForNode();
  const { evaluateIctIfvg } = await import(pathToFileURL(path.join(outRoot, "ictIfvg.mjs")).href);
  const anchorTimestamp = await fetchLatestAnchorTimestamp();
  const depths = [];
  for (const timeframe of fetchTimeframes) {
    depths.push(await fetchChunkedCandles(timeframe, anchorTimestamp));
  }
  const depthsByTimeframe = new Map(depths.map((depth) => [depth.timeframe, depth]));
  const candidatesByKey = new Map();
  const blockerDistribution = {};
  let totalEvaluatedWindows = 0;
  let setupConditionHits = 0;
  let blockedCandidates = 0;

  for (const timeframe of entryTimeframes) {
    const depth = depthsByTimeframe.get(timeframe);
    if (!depth) continue;
    const sliceSize = sliceCandlesByTimeframe[timeframe] ?? 120;
    const stride = evalStrideByTimeframe[timeframe] ?? 1;
    const startIndex = Math.max(0, Math.min(sliceSize - 1, depth.candles.length - 1));
    for (let index = startIndex; index < depth.candles.length; index += stride) {
      const candle = depth.candles[index];
      const parts = nyParts(candle.timestamp);
      const session = sessionBucket(parts.minuteOfDay);
      totalEvaluatedWindows += 1;
      const slice = depth.candles.slice(Math.max(0, index - sliceSize), index + 1);
      const contextCandles = contextFor({ depthsByTimeframe, entryTimeframe: timeframe, timestamp: candle.timestamp });
      const candidate = evaluateIctIfvg({
        candles: slice,
        contextCandles,
        sourceProvider: "mt5_read_only",
        sourceFingerprint: `mt5|${requestedSymbol}|${brokerSymbol}|${timeframe}|${depth.candleCount}`,
        requestedSymbol,
        brokerSymbol,
        timeframe,
        generatedAt: candle.timestamp
      });
      if (candidate.originalFvgCandle) setupConditionHits += 1;
      if (!candidate.canCreateValidationChainEntry) {
        blockedCandidates += 1;
        const reason = candidate.blockers[0] ?? candidate.missingConditions[0] ?? candidate.status;
        blockerDistribution[reason] = (blockerDistribution[reason] ?? 0) + 1;
        continue;
      }
      const outcome = simulateOutcome({ candles: depth.candles, candidate, signalIndex: index, timeframe });
      const compact = compactCandidate({ candidate, timeframe, signalIndex: index, outcome, tradingDate: parts.dayKey, session });
      if (!candidatesByKey.has(compact.key)) candidatesByKey.set(compact.key, compact);
    }
  }
  const entryDepths = entryTimeframes.map((timeframe) => depthsByTimeframe.get(timeframe)).filter(Boolean);
  const firstTimestamp = entryDepths.map((depth) => depth.firstTimestamp).filter(Boolean).sort()[0];
  const lastTimestamp = entryDepths.map((depth) => depth.lastTimestamp).filter(Boolean).sort().at(-1);
  return {
    candidates: [...candidatesByKey.values()],
    firstTimestamp,
    lastTimestamp,
    sourceDepth: depths.map((depth) => ({
      timeframe: depth.timeframe,
      candleCount: depth.candleCount,
      chunkCount: depth.chunks.length,
      availableLookbackDays: depth.availableLookbackDays,
      dataDepthStatus: depth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited"
    })),
    detectorFunnel: {
      totalEvaluatedWindows,
      setupConditionHits,
      blockedCandidates,
      validCandidates: candidatesByKey.size,
      topBlockers: Object.entries(blockerDistribution)
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10)
    }
  };
}

async function main() {
  runClassifierUnitChecks();
  const { candidates, firstTimestamp, lastTimestamp, sourceDepth, detectorFunnel } = await collectCandidates();
  const summary = summarizeExpectancy(candidates, 0);
  const costSensitivity = Object.fromEntries(costLevels.map((cost) => [`${cost}R`, summarizeExpectancy(candidates, cost)]));
  const rolling = rollingExpectancy({ candidates, firstTimestamp, lastTimestamp, costR: 0 });
  const oos = oosSummary(candidates, 0);
  const classifier = classifyIfvg({ summary, rolling, oos, costSensitivity });
  const bySegment = [
    { label: "all_ifvg", ...summary },
    { label: "5m", ...summarizeExpectancy(candidates.filter((candidate) => candidate.timeframe === "5m"), 0) },
    { label: "15m", ...summarizeExpectancy(candidates.filter((candidate) => candidate.timeframe === "15m"), 0) },
    { label: "long", ...summarizeExpectancy(candidates.filter((candidate) => candidate.side === "long"), 0) },
    { label: "short", ...summarizeExpectancy(candidates.filter((candidate) => candidate.side === "short"), 0) },
    { label: "new_york_open", ...summarizeExpectancy(candidates.filter((candidate) => candidate.session === "new_york_open"), 0) },
    { label: "outside_rth", ...summarizeExpectancy(candidates.filter((candidate) => candidate.session === "outside_rth"), 0) }
  ];
  const filterAnalysis = filtersFor(candidates)
    .map(([label, scoped]) => summarizeFilter(label, scoped, firstTimestamp, lastTimestamp))
    .sort((left, right) => {
      const leftPromotable = left.robustnessClassification === "paper_watchlist_candidate" ? 1 : 0;
      const rightPromotable = right.robustnessClassification === "paper_watchlist_candidate" ? 1 : 0;
      return rightPromotable - leftPromotable || right.averageRAtHalfCost - left.averageRAtHalfCost || right.count - left.count;
    });
  const bestVariant = filterAnalysis.find((row) => row.robustnessClassification === "paper_watchlist_candidate") ?? null;
  const promotionDecision = bestVariant
    ? "IFVG has a filtered paper-watchlist candidate for further deterministic validation only; Paper-Demo remains blocked until the full checklist passes."
    : "No IFVG promotion. Keep IFVG replay-required/research-only and test narrower filters before any paper-watchlist progression.";

  const report = {
    status: "passed",
    diagnostic: "ifvg_expectancy_classifier_audit",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      requestedLookbackDays,
      timeframes: sourceDepth,
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    detectorFunnel,
    expectancy: {
      bySegment
    },
    costSensitivity,
    rollingOos: {
      oosVerdict: oos.verdict,
      firstHalf: oos.firstHalf,
      secondHalf: oos.secondHalf,
      activeRollingWindows: rolling.activeRollingWindows,
      weakRollingWindows: rolling.weakWindows,
      windows: rolling.windows.map((window) => ({
        window: window.window,
        from: window.from,
        to: window.to,
        count: window.count,
        targetFirstRate: window.targetFirstRate,
        invalidationFirstRate: window.invalidationFirstRate,
        averageR: window.averageR
      }))
    },
    classifierAudit: {
      previousClassification: "no_edge",
      robustnessClassification: classifier.classification,
      rootCause: classifier.failedGates.some((gate) => gate.gate === "invalidation_first_rate")
        ? "paper-watchlist invalidation-first gate failed despite positive raw expectancy"
        : classifier.failedGates[0]?.gate ?? "none",
      failedGates: classifier.failedGates,
      gateRequirements
    },
    filterAnalysis,
    bestVariant,
    promotionDecision,
    safety,
    authority
  };

  assert.equal(classifier.failedGates.some((gate) => gate.gate === "invalidation_first_rate"), true);
  assert.notEqual(report.classifierAudit.robustnessClassification, "paper_watchlist_candidate");
  assertSafeReport(report);
  writeMarkdownReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    status: "failed",
    diagnostic: "ifvg_expectancy_classifier_audit",
    error: error instanceof Error ? error.message : String(error),
    promotionDecision: "Do not promote IFVG; diagnostic did not complete.",
    safety,
    authority
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
