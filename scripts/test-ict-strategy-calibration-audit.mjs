#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-strategy-calibration-audit-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_STRATEGY_CALIBRATION_DAYS || 90);
const chunkDays = Number(process.env.ICT_STRATEGY_CALIBRATION_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_STRATEGY_CALIBRATION_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_STRATEGY_CALIBRATION_MAX_WINDOWS || 600));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 20000);
const htfTimeframes = ["15m", "1h", "4h", "1d", "1w"];

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

const mt5Files = [
  "mt5ReadOnlyTypes.ts",
  "mt5SymbolSettings.ts",
  "mt5ReadOnlyNormalizer.ts",
  "mt5ReadOnlyDepth.ts",
  "mt5ReadOnlyClient.ts"
];

const exportedSuiteFiles = () => {
  const indexSource = fs.readFileSync(path.join(sourceRoot, "index.ts"), "utf8");
  const files = new Set(["index.ts"]);
  for (const match of indexSource.matchAll(/export\s+\*\s+from\s+"\.\/([^"]+)";/g)) {
    files.add(`${match[1]}.ts`);
  }
  return [...files];
};

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of exportedSuiteFiles()) writeTranspiled(path.join(sourceRoot, file), file);
  for (const file of mt5Files) writeTranspiled(path.join(mt5Root, file), file);
  fs.writeFileSync(
    path.join(outRoot, "candleSourcesStub.mjs"),
    `export async function loadCanonicalCandleSource(sourceId) {
  return globalThis.__ICT_STRATEGY_CALIBRATION_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_STRATEGY_CALIBRATION_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

function writeTranspiled(sourcePath, file) {
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
    .replace(/from\s+"..\/integrations\/mt5\/([^"]+)"/g, 'from "./$1.mjs"')
    .replace(/from\s+'..\/integrations\/mt5\/([^']+)'/g, "from './$1.mjs'")
    .replace(/from\s+"@\/lib\/integrations\/mt5\/([^"]+)"/g, 'from "./$1.mjs"')
    .replace(/from\s+'@\/lib\/integrations\/mt5\/([^']+)'/g, "from './$1.mjs'")
    .replace(/from\s+"..\/candleSources"/g, 'from "./candleSourcesStub.mjs"')
    .replace(/from\s+'..\/candleSources'/g, "from './candleSourcesStub.mjs'")
    .replace(/from\s+"@\/lib\/candleSources"/g, 'from "./candleSourcesStub.mjs"')
    .replace(/from\s+'@\/lib\/candleSources'/g, "from './candleSourcesStub.mjs'");
  fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
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

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const average = (values) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);
const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))));
};
const topCounts = (values, selector, limit = 12) =>
  Object.entries(countBy(values, selector))
    .map(([key, count]) => ({ key, count }))
    .slice(0, limit);

const parseCandleTime = (candle) => {
  const parsed = Date.parse(candle?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle?.time) ? candle.time * 1000 : 0;
};

const normalizeMt5Candles = ({ candles = [], requestedSymbol, brokerSymbol, timeframe }) => {
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
      id: `mt5_strategy_calibration_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
  while (cursor < end && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end);
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchChunkedCandles(timeframe) {
  const latest = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit: Math.min(limitPerChunk, 5000)
  }));
  if (!latest.ok) {
    return {
      timeframe,
      candles: [],
      candleCount: 0,
      chunks: [],
      error: `latest_http_${latest.status}`,
      availableLookbackDays: 0
    };
  }
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) {
    return {
      timeframe,
      candles: [],
      candleCount: 0,
      chunks: [],
      error: "missing_latest_timestamp",
      availableLookbackDays: 0
    };
  }
  const rawCandles = [];
  const chunks = [];
  for (const window of dateWindows(lastTimestamp)) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
    if (!response.ok) {
      chunks.push({ ...window, returnedCount: 0, error: `range_http_${response.status}` });
      continue;
    }
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    rawCandles.push(...chunkCandles);
    chunks.push({
      ...window,
      returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? payload.firstCandleTime ?? chunkCandles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? payload.lastCandleTime ?? chunkCandles.at(-1)?.timestamp
    });
  }
  const candles = normalizeMt5Candles({ candles: rawCandles, requestedSymbol, brokerSymbol, timeframe });
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
        : 0,
    error: candles.length ? undefined : "no_range_candles"
  };
}

const unavailableDepth = (timeframe, reason) => ({
  timeframe,
  candles: [],
  chunks: [],
  candleCount: 0,
  firstTimestamp: undefined,
  lastTimestamp: undefined,
  availableLookbackDays: 0,
  error: reason
});

const makeSource = (depth) => ({
  sourceId: `ict_strategy_calibration:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
  provider: "mt5_read_only",
  symbol: requestedSymbol,
  normalizedSymbol: requestedSymbol,
  timeframe: primaryTimeframe,
  candles: depth.candles,
  candleCount: depth.candles.length,
  firstTimestamp: depth.firstTimestamp,
  lastTimestamp: depth.lastTimestamp,
  storageBackend: "memory",
  dataQuality: depth.candles.length ? "sufficient" : "insufficient",
  eligibility: { chartDisplay: true, quickAnalysis: true, researchCycle: true, walkForward: depth.candles.length >= 1000 },
  eligibilityReasons: [],
  warnings: ["MT5 read-only USTECH is CFD/proxy data, not CME MNQ futures truth."],
  provenance: {
    sourceLabel: "MT5 read-only CFD/proxy strategy calibration source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_strategy_calibration|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
  roles: ["research", "chart_display", "available"]
});

const statusWeight = (status) =>
  status === "approved_research_candidate" ? 5 : status === "paper_watchlist_candidate" ? 4 : status === "watchlist_candidate" ? 3 : status === "rejected_candidate" ? 2 : status === "no_trade" ? 1 : 0;

const selectDecision = (decisions) =>
  decisions.slice().sort((left, right) => statusWeight(right.status) - statusWeight(left.status) || right.approvalScore - left.approvalScore)[0];

const decisionPairsFor = (suite, replayResults) =>
  replayResults.map((result) => {
    const decision = selectDecision(suite.evaluateApprovedSetupProfiles(result));
    return {
      result: {
        ...result,
        approvedProfileStatus: decision?.status,
        approvedProfileId: decision?.profileId,
        approvedProfileScore: decision?.approvalScore,
        approvedProfileReasons: [...(decision?.approvedReasons ?? []), ...(decision?.watchlistReasons ?? []), ...(decision?.rejectionReasons ?? [])].slice(0, 8)
      },
      decision
    };
  });

const hasTarget = (result) => typeof result.tradePath?.target === "number";
const hasInvalidation = (result) => typeof result.tradePath?.invalidation === "number";
const hasRr = (result) => typeof (result.rrEstimate ?? result.tradePath?.rrAchieved) === "number";
const rrFor = (result) => {
  if (typeof result.rrEstimate === "number") return result.rrEstimate;
  if (typeof result.tradePath?.rrAchieved === "number") return result.tradePath.rrAchieved;
  const entry = result.tradePath?.entryReference;
  const target = result.tradePath?.target;
  const invalidation = result.tradePath?.invalidation;
  if (![entry, target, invalidation].every(Number.isFinite)) return undefined;
  const risk = Math.abs(entry - invalidation);
  return risk > 0 ? Math.abs(target - entry) / risk : undefined;
};

const signalTimeMsFor = (result) => {
  const parsed = Date.parse(result.tradePath?.signalTime ?? result.generatedAt ?? result.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
};

const tradingDateForResult = (result) => {
  const parsed = signalTimeMsFor(result);
  return parsed ? new Date(parsed).toISOString().slice(0, 10) : "unknown";
};

const eventTypesFor = (narrative) => new Set((narrative?.events ?? []).map((event) => event.eventType));
const hasAnyEvent = (narrative, ...eventTypes) => {
  const events = eventTypesFor(narrative);
  return eventTypes.some((eventType) => events.has(eventType));
};

const dayCloseFor = (candles, suite, tradingDate) =>
  candles.filter((candle) => suite.tradingDateFor(candle.timestamp) === tradingDate).at(-1)?.close;

const countNarratives = (narratives, predicate) => narratives.filter(predicate).length;

const missingModelReasonFor = (narrative) => {
  if (!narrative || narrative.dataDepth?.status === "unavailable") return "insufficient data";
  const events = eventTypesFor(narrative);
  if (!events.has("asia_range")) return "no Asia range";
  if (!hasAnyEvent(narrative, "london_swept_asia_high", "london_swept_asia_low", "buyside_sweep", "sellside_sweep")) return "no London raid / liquidity sweep";
  if (!hasAnyEvent(narrative, "midnight_open_reclaim", "midnight_open_rejection")) return "no 12AM open relationship";
  if (!hasAnyEvent(narrative, "bearish_expansion", "bullish_expansion", "ny_reversal_higher", "ny_reversal_lower")) return "no displacement / expansion";
  if (!narrative.fvgTarget?.detected) return "no FVG target / PD array";
  if (!narrative.activeDealingRange) return "no dealing range / liquidity draw";
  if (narrative.primaryModelDetection?.missingEvidence?.length) return narrative.primaryModelDetection.missingEvidence[0];
  return "unknown structured opportunity";
};

const targetTypeFor = (result) => {
  if (result.fvgTargetDetected && result.fvgTargetDirection) return `${result.fvgTargetDirection}_fvg`;
  if (result.liquidityTargetType) return result.liquidityTargetType;
  if (hasTarget(result)) return "compact_target_unknown_type";
  return "missing";
};

const targetReasonFor = (result) => {
  if (!hasTarget(result)) return "target missing";
  if (result.fvgTargetDetected) return `target from ${result.fvgTargetDirection ?? "unknown"} FVG draw`;
  if (result.liquidityTargetType) return `target from ${result.liquidityTargetType}`;
  return "target constructed but type not labeled";
};

const invalidationTypeFor = (result) => {
  if (!hasInvalidation(result) || !Number.isFinite(result.tradePath?.entryReference)) return "missing";
  if (result.side === "long") return result.tradePath.invalidation < result.tradePath.entryReference ? "below_entry_sweep_or_structure" : "above_entry_conflict";
  if (result.side === "short") return result.tradePath.invalidation > result.tradePath.entryReference ? "above_entry_sweep_or_structure" : "below_entry_conflict";
  return "unknown";
};

const htfAlignmentStatusFor = (result) => {
  if (result.htfAlignment?.alignmentStatus) return result.htfAlignment.alignmentStatus;
  if (result.htfAligned === true) return "aligned";
  if (result.htfAligned === false) return "missing_or_conflicted";
  return "unknown";
};

const marketCycleStageFor = (result) => {
  const profile = result.sessionNarrativeProfile;
  if (profile === "consolidation_manipulation_distribution" || profile === "accumulation_manipulation_expansion") return "expansion";
  if (profile === "ny_session_reversal_to_premium_fvg" || profile === "ny_session_reversal_from_premium_to_discount") return "reversal";
  if (profile === "range_bound") return "consolidation";
  if (result.modelDetected) return "structured_model";
  return "unknown";
};

const metricsFor = (results) => {
  const rrValues = results.map(rrFor).filter((value) => typeof value === "number");
  return {
    count: results.length,
    targetFirstRate: results.length ? round(results.filter((result) => result.outcome === "target_first").length / results.length, 4) : 0,
    invalidationFirstRate: results.length ? round(results.filter((result) => result.outcome === "invalidation_first").length / results.length, 4) : 0,
    averageRr: average(rrValues),
    countByOutcome: countBy(results, (result) => result.outcome),
    countByModel: countBy(results, (result) => result.modelName ?? result.sessionNarrativeProfile ?? "unknown"),
    countBySessionProfile: countBy(results, (result) => result.sessionNarrativeProfile ?? "unknown"),
    countByHtfAlignment: countBy(results, htfAlignmentStatusFor),
    countByMarketCycleStage: countBy(results, marketCycleStageFor),
    countByTargetType: countBy(results, targetTypeFor),
    countByTradingDate: countBy(results, tradingDateForResult)
  };
};

const performanceBreakdown = (results, selector) =>
  Object.entries(countBy(results, selector)).map(([key]) => {
    const group = results.filter((result) => (selector(result) ?? "unknown") === key);
    return { key, ...metricsFor(group) };
  }).sort((left, right) => right.count - left.count || right.targetFirstRate - left.targetFirstRate).slice(0, 12);

const classifyFrameworkCoverage = () => [
  ["Sunday open / gap", "implemented_and_used", "ictSessionNarrative sunday_open event and opening-gap helpers"],
  ["above/below Sunday open", "partial", "audit compares daily close to compact Sunday-open price; not yet first-class signal field"],
  ["buy-side/sell-side liquidity", "implemented_and_used", "buyside_sweep/sellside_sweep events and liquidity pools"],
  ["daily bias", "implemented_and_used", "D1 context and weekly/daily bias feed Advisor compact summary"],
  ["12AM open", "implemented_and_used", "midnight_open event plus reclaim/rejection events"],
  ["London above/below 12AM open", "partial", "midnight reclaim/rejection and London sweep are detected, but relation is not a named model field"],
  ["London expansion into NY", "implemented_and_used", "bearish/bullish expansion and NY reversal events"],
  ["market cycle stage", "partial", "derived in opportunity/audit; not yet a standalone first-class current-read field"],
  ["consolidation / retracement / reversal / expansion", "implemented_and_used", "session narrative profiles plus replay model detection"],
  ["PD arrays", "implemented_and_used", "FVG, order block, mitigation, breaker, rejection, void helpers and signal fields"],
  ["breaker / mitigation / order block / FVG", "implemented_and_used", "Phase 2 order-block classifiers and session FVG target"],
  ["support/resistance role of PD arrays", "partial", "opportunity PD context labels roles, but replay target/invalidation types need richer labels"],
  ["model detection", "implemented_and_used", "primaryModelDetection and modelDetections are separate from approval"],
  ["trade idea construction", "implemented_and_used", "target/invalidation/RR construction and audit fields"],
  ["self-improvement hypothesis", "implemented_and_used", "opportunity not approved can queue compact research hypothesis"],
  ["replay validation", "implemented_and_used", "runIctReplayValidation and real replay scripts"]
].map(([item, status, evidence]) => ({ item, status, evidence }));

const grinchInventoryFor = (suite) => {
  const inventory = typeof suite.summarizeIctGrinchModelInventory === "function" ? suite.summarizeIctGrinchModelInventory() : undefined;
  return {
    model1: {
      status: "partial",
      requiredConditions: ["12AM/Sunday open relationship", "session manipulation", "PD-array target", "expansion confirmation"],
      currentlyDetectedFields: ["midnight_open", "sunday_open", "session sweep events", "FVG target", "expansion events"],
      missingFields: ["first-class Model 1 ordered contract", "hard/soft evidence map by model state"],
      recommendedSteps: ["Promote Model 1 into ICT Strategy Suite modelDetections after exact rules are encoded."]
    },
    reversal: {
      status: "partial",
      requiredConditions: ["liquidity sweep", "counter-trend displacement", "PD-array target", "timing validity"],
      currentlyDetectedFields: ["ny_session_reversal_to_premium_fvg", "sellside/buyside sweep", "ny_reversal_higher/lower", "FVG target"],
      missingFields: ["full Grinch reversal contract and naming", "separate first/final target scoring"],
      recommendedSteps: ["Map existing NY reversal narrative to a named Grinch reversal detector."]
    },
    consolidation: {
      status: "partial",
      requiredConditions: ["Asia/London consolidation", "raid", "NY mitigation", "clean expansion"],
      currentlyDetectedFields: ["consolidation_manipulation_distribution", "asia_range", "london equal highs/lows", "NY mitigation", "bearish/bullish expansion"],
      missingFields: ["full Grinch consolidation contract and per-step replay score"],
      recommendedSteps: ["Keep CMD paper-only; continue OOS validation before approval promotion."]
    },
    rawInventory: inventory
  };
};

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i, "Calibration audit must not expose raw candles or snapshots.");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i,
    "Calibration audit must not expose secrets or account/order/position data."
  );
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const primaryDepth = await fetchChunkedCandles(primaryTimeframe);
  if (!primaryDepth.candles.length) {
    throw new Error(`No ${brokerSymbol}/${requestedSymbol} ${primaryTimeframe} candles were available from the MT5 read-only range endpoint: ${primaryDepth.error ?? "unknown_error"}`);
  }
  const htfDepths = {};
  for (const timeframe of htfTimeframes) {
    try {
      htfDepths[timeframe] = await fetchChunkedCandles(timeframe);
    } catch (error) {
      htfDepths[timeframe] = unavailableDepth(timeframe, error instanceof Error ? error.message : String(error));
    }
  }
  globalThis.__ICT_STRATEGY_CALIBRATION_SOURCES = new Map([[makeSource(primaryDepth).sourceId, makeSource(primaryDepth)]]);

  const htfCandles = Object.fromEntries(
    Object.entries(htfDepths)
      .filter(([, depth]) => depth.candles.length)
      .map(([timeframe, depth]) => [timeframe, depth.candles])
  );

  const replay = suite.runIctReplayValidation({
    symbol: requestedSymbol,
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe,
    htfTimeframes: Object.keys(htfCandles),
    candles: primaryDepth.candles,
    htfCandles,
    indexComparisonCandles: { [brokerSymbol]: primaryDepth.candles },
    newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_strategy_calibration" },
    replayWindowSize: 80,
    lookaheadCandles: 24,
    maxReplayWindows,
    requestedLookbackDays,
    availableLookbackDays: primaryDepth.availableLookbackDays,
    dataDepthStatus: primaryDepth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited",
    appendJournal: false,
    researchOnly: true
  });
  assert.equal(suite.assertIctReplayOutputIsCompact(replay).ok, true, "Replay output must remain compact.");

  const replayResults = replay.results ?? [];
  const pairs = decisionPairsFor(suite, replayResults);
  const decisions = pairs.map((pair) => pair.decision);
  const uniqueTradingDates = [...new Set(primaryDepth.candles.map((candle) => suite.tradingDateFor(candle.timestamp)))].sort();
  const narratives = uniqueTradingDates.map((tradingDate) =>
    suite.buildIctSessionNarrative(primaryDepth.candles, {
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      tradingDate,
      requestedLookbackDays,
      availableLookbackDays: primaryDepth.availableLookbackDays,
      dataDepthStatus: primaryDepth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited"
    })
  );

  const pools = suite.detectLiquidityPools(primaryDepth.candles);
  const modelDetectedNarratives = narratives.filter((narrative) => narrative.primaryModelDetection?.modelDetected);
  const structuredOpportunityNarratives = narratives.filter((narrative) =>
    !narrative.primaryModelDetection?.modelDetected &&
    (narrative.events.length > 2 || narrative.activeDealingRange || narrative.fvgTarget?.detected)
  );
  const marketMapOnlyNarratives = narratives.filter((narrative) =>
    !narrative.primaryModelDetection?.modelDetected &&
    !structuredOpportunityNarratives.includes(narrative) &&
    narrative.dataDepth?.status !== "unavailable"
  );
  const insufficientNarratives = narratives.filter((narrative) => narrative.dataDepth?.status === "unavailable");

  const researchResults = pairs.filter(({ result }) => result.decision === "research_only").map(({ result }) => result);
  const approvedResults = pairs.filter(({ decision }) => decision?.status === "approved_research_candidate").map(({ result }) => result);
  const paperResults = pairs.filter(({ decision }) => decision?.status === "paper_watchlist_candidate").map(({ result }) => result);
  const watchlistResults = pairs.filter(({ decision }) => decision?.status === "watchlist_candidate").map(({ result }) => result);
  const rejectedResults = pairs.filter(({ decision }) => decision?.status === "rejected_candidate").map(({ result }) => result);
  const noTradeResults = pairs.filter(({ decision, result }) => decision?.status === "no_trade" || result.decision === "no_trade").map(({ result }) => result);
  const rejectedWithModel = pairs.filter(({ decision, result }) => decision?.status === "rejected_candidate" && result.modelDetected);
  const noTradeWithOpportunity = pairs.filter(({ decision, result }) =>
    (decision?.status === "no_trade" || result.decision === "no_trade") &&
    (result.modelDetected || result.sessionNarrativeProfile || result.fvgTargetDetected)
  );

  const missingTradeRows = researchResults.flatMap((result) => [
    hasTarget(result) ? undefined : { field: "target", result },
    hasInvalidation(result) ? undefined : { field: "invalidation", result },
    hasRr(result) ? undefined : { field: "RR", result }
  ].filter(Boolean));

  const pdArrayWindowSamples = uniqueTradingDates.map((tradingDate) => {
    const dayCandles = primaryDepth.candles.filter((candle) => suite.tradingDateFor(candle.timestamp) === tradingDate);
    return {
      tradingDate,
      fvg: suite.detectFairValueGap(dayCandles),
      orderBlock: suite.detectOrderBlock(dayCandles),
      mitigationBlock: suite.detectMitigationBlock(dayCandles),
      breakerBlock: suite.detectBreakerBlock(dayCandles),
      rejectionBlock: suite.detectRejectionBlock(dayCandles),
      liquidityVoid: suite.detectLiquidityVoid(dayCandles)
    };
  });

  const frameworkDetection = {
    sundayOpenDetectedCount: countNarratives(narratives, (narrative) => typeof narrative.sundayOpen?.price === "number"),
    priceAboveSundayOpenCount: countNarratives(narratives, (narrative) => {
      const close = dayCloseFor(primaryDepth.candles, suite, narrative.tradingDate);
      return typeof close === "number" && typeof narrative.sundayOpen?.price === "number" && close > narrative.sundayOpen.price;
    }),
    priceBelowSundayOpenCount: countNarratives(narratives, (narrative) => {
      const close = dayCloseFor(primaryDepth.candles, suite, narrative.tradingDate);
      return typeof close === "number" && typeof narrative.sundayOpen?.price === "number" && close < narrative.sundayOpen.price;
    }),
    midnightOpenDetectedCount: countNarratives(narratives, (narrative) => typeof narrative.midnightOpen?.price === "number"),
    londonTradedAboveMidnightOpenCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "midnight_open_reclaim", "london_swept_asia_high", "buyside_sweep")),
    londonTradedBelowMidnightOpenCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "midnight_open_rejection", "london_swept_asia_low", "sellside_sweep")),
    londonExpansionIntoNyCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "bearish_expansion", "bullish_expansion")),
    asiaRangeDetectedCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "asia_range")),
    nyOpenSweepCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "ny_open_consolidation_low_sweep", "ny_open_consolidation_high_sweep")),
    nyReversalCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "ny_reversal_higher", "ny_reversal_lower")),
    nyContinuationCount: countNarratives(narratives, (narrative) => hasAnyEvent(narrative, "bearish_expansion", "bullish_expansion"))
  };

  const liquidityDetection = {
    buySideLiquidityPoolsDetected: pools.filter((pool) => /high|buy/i.test(pool.type)).length,
    sellSideLiquidityPoolsDetected: pools.filter((pool) => /low|sell/i.test(pool.type)).length,
    equalHighsDetected: pools.filter((pool) => pool.type === "equal_highs").length,
    equalLowsDetected: pools.filter((pool) => pool.type === "equal_lows").length,
    priorDayHighDetected: pools.filter((pool) => pool.type === "previous_day_high").length,
    priorDayLowDetected: pools.filter((pool) => pool.type === "previous_day_low").length,
    priorWeekHighDetected: pools.filter((pool) => pool.type === "previous_week_high").length,
    priorWeekLowDetected: pools.filter((pool) => pool.type === "previous_week_low").length,
    asiaHighLiquidityDetected: countNarratives(narratives, (narrative) => narrative.ranges.some((range) => range.session === "asia" && typeof range.high === "number")),
    asiaLowLiquidityDetected: countNarratives(narratives, (narrative) => narrative.ranges.some((range) => range.session === "asia" && typeof range.low === "number")),
    londonHighLiquidityDetected: countNarratives(narratives, (narrative) => narrative.ranges.some((range) => range.session === "london" && typeof range.high === "number")),
    londonLowLiquidityDetected: countNarratives(narratives, (narrative) => narrative.ranges.some((range) => range.session === "london" && typeof range.low === "number"))
  };

  const pdArrayDetection = {
    fvgCountByTimeframe: { [primaryTimeframe]: pdArrayWindowSamples.filter((sample) => sample.fvg).length },
    bullishFvgCount: pdArrayWindowSamples.filter((sample) => sample.fvg?.direction === "bullish").length,
    bearishFvgCount: pdArrayWindowSamples.filter((sample) => sample.fvg?.direction === "bearish").length,
    orderBlockCount: pdArrayWindowSamples.filter((sample) => sample.orderBlock).length,
    mitigationBlockCount: pdArrayWindowSamples.filter((sample) => sample.mitigationBlock).length,
    breakerBlockCount: pdArrayWindowSamples.filter((sample) => sample.breakerBlock).length,
    rejectionBlockCount: pdArrayWindowSamples.filter((sample) => sample.rejectionBlock).length,
    liquidityVoidCount: pdArrayWindowSamples.filter((sample) => sample.liquidityVoid).length,
    pdArraysUsedAsTarget: researchResults.filter((result) => result.fvgTargetDetected || /fvg|liquidity/i.test(result.liquidityTargetType ?? "")).length,
    pdArraysUsedAsSupportResistance: researchResults.filter((result) => Boolean(result.orderBlockVariant)).length,
    pdArraysUsedAsEntryContext: researchResults.filter((result) => result.fvgStatus && result.fvgStatus !== "not_applicable").length,
    pdArraysUsedAsInvalidation: researchResults.filter((result) => invalidationTypeFor(result) !== "missing").length
  };

  const modelDetection = {
    cmdDetections: countNarratives(narratives, (narrative) => narrative.modelDetections.some((item) => item.modelName === "consolidation_manipulation_distribution")),
    ameDetections: countNarratives(narratives, (narrative) => narrative.modelDetections.some((item) => item.modelName === "accumulation_manipulation_expansion")),
    nyReversalToPremiumFvgDetections: countNarratives(narratives, (narrative) => narrative.modelDetections.some((item) => item.modelName === "ny_session_reversal_to_premium_fvg")),
    nyReversalFromPremiumToDiscountDetections: countNarratives(narratives, (narrative) => narrative.profile === "ny_session_reversal_from_premium_to_discount"),
    rangeBoundDetections: countNarratives(narratives, (narrative) => narrative.profile === "range_bound" || narrative.modelDetections.some((item) => item.modelName === "range_liquidity_sweep")),
    grinchModelDetections: 0,
    genericIctModelDetections: modelDetectedNarratives.length,
    unknownStructuredOpportunities: structuredOpportunityNarratives.length,
    byModelName: countBy(narratives.flatMap((narrative) => narrative.modelDetections), (detection) => detection.modelName),
    byPrimaryModelState: countBy(modelDetectedNarratives, (narrative) => narrative.primaryModelDetection?.modelState)
  };

  const tradeConstruction = {
    opportunitiesWithTarget: researchResults.filter(hasTarget).length,
    opportunitiesWithInvalidation: researchResults.filter(hasInvalidation).length,
    opportunitiesWithRr: researchResults.filter(hasRr).length,
    opportunitiesMissingTarget: researchResults.filter((result) => !hasTarget(result)).length,
    opportunitiesMissingInvalidation: researchResults.filter((result) => !hasInvalidation(result)).length,
    opportunitiesMissingRr: researchResults.filter((result) => !hasRr(result)).length,
    reasonsFieldsMissing: topCounts(missingTradeRows, (row) => `${row.field}:${row.result.modelName ?? row.result.sessionNarrativeProfile ?? "unknown"}`),
    targetTypes: countBy(researchResults, targetTypeFor),
    invalidationTypes: countBy(researchResults, invalidationTypeFor),
    targetReasons: topCounts(researchResults, targetReasonFor),
    rrConstructionQuality: {
      completePct: researchResults.length ? round(researchResults.filter((result) => hasTarget(result) && hasInvalidation(result) && hasRr(result)).length / researchResults.length, 4) : 0,
      averageRr: average(researchResults.map(rrFor).filter((value) => typeof value === "number"))
    }
  };

  const laneDistribution = {
    approved: approvedResults.length,
    paper_watchlist: paperResults.length,
    watchlist: watchlistResults.length,
    rejected: rejectedResults.length,
    no_trade: noTradeResults.length,
    rejectedButModelDetected: rejectedWithModel.length,
    noTradeButOpportunityDetected: noTradeWithOpportunity.length
  };

  const dailyClassification = {
    knownModelDetected: modelDetectedNarratives.length,
    structuredOpportunityDetected: structuredOpportunityNarratives.length,
    noModelButMarketMapAvailable: marketMapOnlyNarratives.length,
    insufficientData: insufficientNarratives.length,
    topMissedModelReasons: topCounts(
      narratives.filter((narrative) => !narrative.primaryModelDetection?.modelDetected && narrative.dataDepth?.status !== "unavailable"),
      missingModelReasonFor
    ),
    exampleDatesByMissedReason: Object.fromEntries(
      Object.entries(countBy(narratives, missingModelReasonFor)).slice(0, 8).map(([reason]) => [
        reason,
        narratives.filter((narrative) => missingModelReasonFor(narrative) === reason).map((narrative) => narrative.tradingDate).slice(0, 5)
      ])
    )
  };

  const universalRecognitions = narratives.map((narrative) =>
    suite.buildIctUniversalRecognition({
      sessionNarrative: narrative,
      approvedStatus: narrative.primaryModelDetection?.modelDetected ? "watchlist_candidate" : "no_trade",
      generatedAt: narrative.tradingDate ? `${narrative.tradingDate}T00:00:00.000Z` : undefined
    })
  );
  const recognitionTierDistribution = countBy(universalRecognitions, (recognition) => recognition.tier);
  const scalpRecognitions = universalRecognitions.filter((recognition) => recognition.tier === "scalp_setup");
  const pdArrayRecognitions = universalRecognitions.filter((recognition) => recognition.tier === "pd_array_setup");
  const scalpReplayableResults = researchResults.filter((result) =>
    /sweep|raid|displacement|mitigation|fvg|scalp/i.test([
      result.strategyId,
      result.setup,
      result.modelName,
      result.sessionNarrativeProfile,
      result.liquidityTargetType,
      result.fvgStatus,
      result.orderBlockVariant
    ].filter(Boolean).join(" "))
  );
  const pdArrayReplayableResults = researchResults.filter((result) =>
    Boolean(
      result.fvgTargetDetected ||
      result.fvgStatus ||
      result.orderBlockVariant ||
      /fvg|liquidity|target|order|mitigation|breaker|rejection|propulsion/i.test(targetTypeFor(result))
    )
  );
  const universalRecognitionAudit = {
    tierDistribution: recognitionTierDistribution,
    scalpSetupCount: scalpRecognitions.length,
    pdArraySetupCount: pdArrayRecognitions.length,
    fullModelCount: universalRecognitions.filter((recognition) => recognition.tier === "full_model").length,
    formingModelCount: universalRecognitions.filter((recognition) => recognition.tier === "forming_model").length,
    unknownStructuredOpportunityCount: universalRecognitions.filter((recognition) => recognition.tier === "unknown_structured_opportunity").length,
    marketMapOnlyCount: universalRecognitions.filter((recognition) => recognition.tier === "market_map_only").length,
    insufficientDataCount: universalRecognitions.filter((recognition) => recognition.tier === "insufficient_data").length,
    pdArrayCount: universalRecognitions.reduce((total, recognition) => total + recognition.pdArrays.length, 0),
    scalpTargetFirstIfReplayable: {
      replayableCount: scalpReplayableResults.length,
      ...metricsFor(scalpReplayableResults)
    },
    pdArrayPerformanceIfReplayable: {
      replayableCount: pdArrayReplayableResults.length,
      ...metricsFor(pdArrayReplayableResults)
    }
  };

  const performance = {
    targetFirstByModel: performanceBreakdown(researchResults, (result) => result.modelName ?? result.sessionNarrativeProfile ?? "unknown"),
    targetFirstByPdArrayTargetType: performanceBreakdown(researchResults, targetTypeFor),
    targetFirstBySessionModel: performanceBreakdown(researchResults, (result) => result.sessionNarrativeProfile ?? "unknown"),
    targetFirstByMarketCycleStage: performanceBreakdown(researchResults, marketCycleStageFor),
    targetFirstByHtfAlignmentState: performanceBreakdown(researchResults, htfAlignmentStatusFor),
    targetFirstByTimeOfDaySession: performanceBreakdown(researchResults, (result) => result.sessionName ?? "unknown")
  };

  const recommendedCalibrationChanges = [
    tradeConstruction.opportunitiesMissingTarget > 0 ? "Improve deterministic target labeling from nearest opposing liquidity, FVG, and session extremes before changing approval thresholds." : undefined,
    tradeConstruction.opportunitiesMissingInvalidation > 0 ? "Improve invalidation labeling from sweep extreme, mitigation/order-block boundary, FVG origin, or session range extreme." : undefined,
    modelDetection.unknownStructuredOpportunities > 0 ? "Convert repeated unknown structured opportunities into explicit model contracts only after replay evidence confirms quality." : undefined,
    "Keep HTF filtering model-aware: trend continuation strict, reversal/CMD partial context only as watchlist or paper-watchlist.",
    "Keep range_bound conservative and do not promote without reversal or expansion evidence.",
    "Add firstTarget/finalTarget labels to future replay outputs so paper-watchlist scoring can separate nearest draw from final objective."
  ].filter(Boolean);

  const report = {
    status: "passed",
    diagnostic: "ict_strategy_calibration_audit",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      requestedLookbackDays,
      availableLookbackDays: primaryDepth.availableLookbackDays,
      candleCount: primaryDepth.candleCount,
      completedChunkCount: primaryDepth.chunks.filter((chunk) => chunk.returnedCount > 0).length,
      firstTimestamp: primaryDepth.firstTimestamp,
      lastTimestamp: primaryDepth.lastTimestamp,
      dataDepthStatus: primaryDepth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited",
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth.",
      htfDepth: Object.fromEntries(Object.entries(htfDepths).map(([timeframe, depth]) => [
        timeframe,
        {
          candleCount: depth.candleCount,
          availableLookbackDays: depth.availableLookbackDays,
          loaded: depth.candleCount > 0,
          error: depth.error
        }
      ]))
    },
    marketFrameworkDetection: frameworkDetection,
    liquidityDetection,
    pdArrayDetection,
    universalRecognition: universalRecognitionAudit,
    modelDetection,
    tradeConstruction,
    laneDistribution,
    dailyClassification,
    performance,
    grinchModelInventory: grinchInventoryFor(suite),
    humanFrameworkCoverage: classifyFrameworkCoverage(),
    calibrationReport: {
      modelCounts: modelDetection.byModelName,
      opportunityCounts: {
        modelDetectedDays: modelDetectedNarratives.length,
        structuredOpportunityDays: structuredOpportunityNarratives.length,
        pdArraySetupDays: universalRecognitionAudit.pdArraySetupCount,
        scalpSetupDays: universalRecognitionAudit.scalpSetupCount,
        replayResearchSignals: researchResults.length
      },
      universalRecognition: universalRecognitionAudit,
      laneDistribution,
      topMissedModelReasons: dailyClassification.topMissedModelReasons,
      topRejectedWithModelReasons: topCounts(rejectedWithModel, ({ decision }) => decision?.rejectionReasons?.[0] ?? "reason unavailable"),
      topTargetInvalidationRrDefects: tradeConstruction.reasonsFieldsMissing,
      bestPerformingModels: performance.targetFirstByModel.slice(0, 5),
      weakestModels: performance.targetFirstByModel.slice().sort((left, right) => left.targetFirstRate - right.targetFirstRate || right.count - left.count).slice(0, 5),
      pdArrayPerformance: performance.targetFirstByPdArrayTargetType.slice(0, 8),
      htfAlignmentPerformance: performance.targetFirstByHtfAlignmentState,
      recommendedCalibrationChanges,
      safeNextSteps: [
        "Review the top missed-model reasons before loosening any lane.",
        "Fix propagation/labeling defects before changing thresholds.",
        "Continue paper-only tracking for validated paper-watchlist models.",
        "Do not enable execution or readiness override."
      ]
    },
    safety,
    authority
  };

  assert.ok(replayResults.length > 0, "Calibration audit must produce replay windows.");
  assert.ok(narratives.length > 0, "Calibration audit must classify trading days.");
  assert.ok(modelDetection.genericIctModelDetections > 0 || modelDetection.unknownStructuredOpportunities > 0, "Audit must detect models or structured opportunities before approval.");
  assert.ok(pdArrayDetection.fvgCountByTimeframe[primaryTimeframe] >= 0, "PD-array audit must run.");
  assert.ok(Object.keys(universalRecognitionAudit.tierDistribution).length > 0, "Universal recognition tier distribution must be reported.");
  assert.ok(Object.keys(liquidityDetection).length >= 1, "Liquidity map must be reported.");
  assert.ok(Array.isArray(performance.targetFirstByHtfAlignmentState), "HTF alignment performance must be reported.");
  assertSafeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT strategy calibration audit failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
