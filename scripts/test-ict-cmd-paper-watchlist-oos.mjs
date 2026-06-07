#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-cmd-paper-watchlist-oos-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_CMD_OOS_DAYS || 90);
const chunkDays = Number(process.env.ICT_CMD_OOS_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_CMD_OOS_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_CMD_OOS_MAX_WINDOWS || 300));
const currentEvidenceReplayWindows = Math.max(maxReplayWindows, Number(process.env.ICT_CMD_OOS_CURRENT_EVIDENCE_WINDOWS || 1000));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);
const rollingWindowDays = Number(process.env.ICT_CMD_OOS_ROLLING_WINDOW_DAYS || 30);
const rollingStepDays = Number(process.env.ICT_CMD_OOS_ROLLING_STEP_DAYS || 15);

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

const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictSessionNarrativeTypes.ts" },
  { root: sourceRoot, file: "ictGrinchModelTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizerTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictMonteCarloTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchStateTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchState.ts" },
  { root: sourceRoot, file: "ictSignalContractTypes.ts" },
  { root: sourceRoot, file: "ictSignalContract.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulatorTypes.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulator.ts" },
  { root: sourceRoot, file: "ictCmdPaperTrackingTypes.ts" },
  { root: sourceRoot, file: "ictCmdPaperTracking.ts" },
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictBrowserResearchLimits.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictSessionNarrative.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictCurrentReadTypes.ts" },
  { root: sourceRoot, file: "ictCurrentRead.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizer.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
  { root: sourceRoot, file: "ictMonteCarlo.ts" },
  { root: sourceRoot, file: "ictResearchReport.ts" },
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
  { root: mt5Root, file: "mt5ReadOnlyDepth.ts" },
  { root: mt5Root, file: "mt5ReadOnlyClient.ts" },
  { root: sourceRoot, file: "index.ts" }
];

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const { root, file } of sourceFiles) {
    const sourcePath = path.join(root, file);
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
      .replace(/from\s+'..\/candleSources'/g, "from './candleSourcesStub.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
  fs.writeFileSync(
    path.join(outRoot, "candleSourcesStub.mjs"),
    `export async function loadCanonicalCandleSource(sourceId) {
  return globalThis.__ICT_CMD_OOS_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_CMD_OOS_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
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
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))));
};

const topCounts = (values, selector, limit = 12) =>
  Object.entries(countBy(values, selector))
    .map(([key, count]) => ({ key, count }))
    .slice(0, limit);

const maxShareFromCounts = (counts, total) => {
  if (!total) return 0;
  const max = Math.max(0, ...Object.values(counts).map((count) => Number(count) || 0));
  return round(max / total, 4);
};

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
      id: `mt5_cmd_oos_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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

async function fetchChunkedReplayCandles({ requestedSymbol, brokerSymbol, timeframe, limit }) {
  const latest = await fetchWithTimeout(
    endpoint("candles", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe,
      limit: Math.min(limit ?? limitPerChunk, limitPerChunk)
    })
  );
  if (!latest.ok) throw new Error(`Latest MT5 candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 candles did not include a last timestamp.");

  const rawCandles = [];
  const chunkReports = [];
  for (const window of dateWindows(lastTimestamp)) {
    const response = await fetchWithTimeout(
      endpoint("candles/range", {
        requestedSymbol,
        symbol: brokerSymbol,
        timeframe,
        from: window.from,
        to: window.to,
        limit: limitPerChunk
      })
    );
    if (!response.ok) throw new Error(`Range MT5 candles returned HTTP ${response.status}`);
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    rawCandles.push(...chunkCandles);
    chunkReports.push({
      returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? payload.firstCandleTime ?? chunkCandles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? payload.lastCandleTime ?? chunkCandles.at(-1)?.timestamp
    });
  }

  const candles = normalizeMt5Candles({ candles: rawCandles, requestedSymbol, brokerSymbol, timeframe });
  return {
    requestedSymbol,
    brokerSymbol,
    timeframe,
    candles,
    candleCount: candles.length,
    connectionStatus: candles.length ? "connected" : "disconnected",
    depthStatus: candles.length > 5000 ? "full" : candles.length ? "partial" : "disconnected",
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles.at(-1)?.timestamp,
    warnings: [`Explicit CMD OOS diagnostic used ${chunkReports.length} read-only range chunk(s); raw candles stay internal.`],
    missingEvidence: candles.length ? [] : ["No usable MT5 range candles returned for CMD OOS diagnostic."]
  };
}

const makeSource = (depth) => ({
  sourceId: `ict_cmd_oos:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
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
    sourceLabel: "MT5 read-only CFD/proxy CMD OOS diagnostic source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_cmd_oos|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
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
        approvedProfileReasons: [...(decision?.approvedReasons ?? []), ...(decision?.watchlistReasons ?? []), ...(decision?.rejectionReasons ?? [])].slice(0, 10)
      },
      decision
    };
  });

const plannedRrFor = (result) => {
  const entry = result.tradePath?.entryReference;
  const target = result.tradePath?.target;
  const invalidation = result.tradePath?.invalidation;
  if (![entry, target, invalidation].every(Number.isFinite)) return undefined;
  const risk = Math.abs(entry - invalidation);
  const reward = Math.abs(target - entry);
  return risk > 0 ? round(reward / risk, 4) : undefined;
};

const resultRrFor = (result) => (typeof result.rrEstimate === "number" ? result.rrEstimate : plannedRrFor(result) ?? result.tradePath?.rrAchieved);
const confidenceFor = (result) => (typeof result.confidence === "number" ? result.confidence : undefined);
const hasTarget = (result) => typeof result.tradePath?.target === "number";
const hasInvalidation = (result) => typeof result.tradePath?.invalidation === "number";
const hasRr = (result) => typeof resultRrFor(result) === "number";
const signalTimeMsFor = (result) => {
  const parsed = Date.parse(result.tradePath?.signalTime ?? result.generatedAt ?? result.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
};
const tradingDateFor = (result) => {
  const parsed = signalTimeMsFor(result);
  return parsed ? new Date(parsed).toISOString().slice(0, 10) : "unknown";
};
const isCmd = (result) =>
  result.sessionNarrativeProfile === "consolidation_manipulation_distribution" ||
  result.modelName === "consolidation_manipulation_distribution";
const sessionConfirmsDirection = (result) =>
  (result.sessionDirectionalRead === "bullish" && result.side === "long") ||
  (result.sessionDirectionalRead === "bearish" && result.side === "short");
const targetTypeFor = (result) => {
  if (result.fvgTargetDetected && result.fvgTargetDirection) return `${result.fvgTargetDirection}_fvg`;
  if (result.liquidityTargetType) return result.liquidityTargetType;
  return hasTarget(result) ? "compact_target_unknown_type" : "missing";
};
const invalidationTypeFor = (result) => {
  if (!hasInvalidation(result) || !Number.isFinite(result.tradePath?.entryReference)) return "missing";
  if (result.side === "long") return result.tradePath.invalidation < result.tradePath.entryReference ? "below_entry" : "above_entry";
  if (result.side === "short") return result.tradePath.invalidation > result.tradePath.entryReference ? "above_entry" : "below_entry";
  return "unknown";
};

const metricsFor = (results) => {
  const rrValues = results.map(resultRrFor).filter((value) => typeof value === "number");
  const confidenceValues = results.map(confidenceFor).filter((value) => typeof value === "number");
  const targetFirst = results.filter((result) => result.outcome === "target_first").length;
  const invalidationFirst = results.filter((result) => result.outcome === "invalidation_first").length;
  const partial = results.filter((result) => result.outcome === "partial_target").length;
  const stalled = results.filter((result) => result.outcome === "stalled").length;
  const dateCounts = countBy(results, tradingDateFor);
  return {
    count: results.length,
    targetFirstRate: results.length ? round(targetFirst / results.length, 4) : 0,
    invalidationFirstRate: results.length ? round(invalidationFirst / results.length, 4) : 0,
    partialCount: partial,
    stalledCount: stalled,
    averageRr: average(rrValues),
    medianRr: median(rrValues),
    averageConfidence: average(confidenceValues),
    countByModelName: countBy(results, (result) => result.modelName ?? "unknown"),
    countBySessionNarrativeProfile: countBy(results, (result) => result.sessionNarrativeProfile ?? "unknown"),
    countBySide: countBy(results, (result) => result.side ?? "unknown"),
    countBySetup: countBy(results, (result) => result.setup ?? "unknown"),
    countByReason: topCounts(results, (result) => result.approvedProfileReasons?.[0] ?? result.noTradeReasons?.[0] ?? "reason unavailable", 10),
    countByTradingDate: dateCounts,
    dateConcentrationShare: maxShareFromCounts(dateCounts, results.length),
    countByTargetType: countBy(results, targetTypeFor),
    countByInvalidationType: countBy(results, invalidationTypeFor),
    missingTargetCount: results.filter((result) => !hasTarget(result)).length,
    missingInvalidationCount: results.filter((result) => !hasInvalidation(result)).length,
    missingRrCount: results.filter((result) => !hasRr(result)).length
  };
};

const compactMonteCarlo = (summary) => ({
  usableOutcomes: summary.input.usableOutcomes,
  robustnessRating: summary.recommendation.robustnessRating,
  medianEndingR: summary.performance.medianEndingR,
  fifthPercentileEndingR: summary.performance.fifthPercentileEndingR,
  medianMaxDrawdownR: summary.performance.medianMaxDrawdownR,
  worstMaxDrawdownR: summary.performance.worstMaxDrawdownR,
  longestLosingStreak: summary.performance.worstLongestLosingStreak,
  riskOfRuinPct: summary.performance.riskOfRuinPct,
  recommendedMaxRiskPerTradePct: summary.recommendation.recommendedMaxRiskPerTradePct,
  warnings: summary.recommendation.warnings
});

const insufficientMonteCarlo = () => ({
  usableOutcomes: 0,
  robustnessRating: "insufficient_data",
  medianEndingR: 0,
  fifthPercentileEndingR: 0,
  medianMaxDrawdownR: 0,
  worstMaxDrawdownR: 0,
  longestLosingStreak: 0,
  riskOfRuinPct: 0,
  recommendedMaxRiskPerTradePct: 0,
  warnings: ["No paper-watchlist outcomes were available for this window."]
});

const monteCarloFor = (suite, results, randomSeed) => {
  const outcomes = suite.extractMonteCarloOutcomesFromReplayResults(
    results.map((result) => ({ ...result, approvedProfileStatus: "paper_watchlist_candidate" }))
  );
  if (!outcomes.length) return insufficientMonteCarlo();
  const summary = suite.runMonteCarloBatch(outcomes, {
    source: "real_replay_runner",
    includeApprovedOnly: true,
    includeWatchlist: true,
    simulationCount: 400,
    tradesPerSimulation: Math.min(100, Math.max(1, outcomes.length)),
    randomSeed,
    researchOnly: true
  });
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(summary).ok, true, "CMD OOS Monte Carlo summary must stay compact");
  return compactMonteCarlo(summary);
};

const buildRollingWindows = (firstTimestamp, lastTimestamp) => {
  const first = Date.parse(firstTimestamp);
  const last = Date.parse(lastTimestamp);
  assert.equal(Number.isFinite(first) && Number.isFinite(last), true, "Depth timestamps must be valid.");
  const windowMs = Math.max(1, rollingWindowDays) * 86_400_000;
  const stepMs = Math.max(1, rollingStepDays) * 86_400_000;
  const windows = [];
  let cursor = first;
  let index = 1;
  while (cursor < last && windows.length < 32) {
    const end = Math.min(cursor + windowMs, last + 1);
    if (end > cursor) {
      windows.push({
        id: `rolling_${rollingWindowDays}d_${rollingStepDays}d_${index}`,
        from: new Date(cursor).toISOString(),
        to: new Date(end).toISOString()
      });
    }
    if (cursor + windowMs >= last) break;
    cursor += stepMs;
    index += 1;
  }
  return windows;
};

const buildHalfWindows = (firstTimestamp, lastTimestamp) => {
  const first = Date.parse(firstTimestamp);
  const last = Date.parse(lastTimestamp);
  const midpoint = Math.floor(first + (last - first) / 2);
  return [
    { id: "first_half", from: new Date(first).toISOString(), to: new Date(midpoint).toISOString() },
    { id: "second_half", from: new Date(midpoint).toISOString(), to: new Date(last + 1).toISOString() }
  ];
};

const availableLookbackDaysFor = (depth) =>
  depth.firstTimestamp && depth.lastTimestamp
    ? round((Date.parse(depth.lastTimestamp) - Date.parse(depth.firstTimestamp)) / 86_400_000, 2)
    : 0;

const sliceCandlesForWindow = (candles, window) => {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  return candles.filter((candle) => {
    const timestamp = Date.parse(candle.timestamp);
    return Number.isFinite(timestamp) && timestamp >= from && timestamp < to;
  });
};

const runReplayPairsForWindow = (suite, depth, htfDepths, window, maxWindowsForSegment = maxReplayWindows) => {
  const candles = sliceCandlesForWindow(depth.candles, window);
  const htfCandles = Object.fromEntries(
    Object.entries(htfDepths)
      .map(([timeframe, htfDepth]) => [timeframe, sliceCandlesForWindow(htfDepth.candles, window)])
      .filter(([, values]) => values.length)
  );
  const report = suite.runIctReplayValidation({
    symbol: requestedSymbol,
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe,
    htfTimeframes: Object.keys(htfCandles),
    candles,
    htfCandles,
    indexComparisonCandles: { [brokerSymbol]: candles },
    newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_replay" },
    replayWindowSize: 80,
    lookaheadCandles: 12,
    maxReplayWindows: maxWindowsForSegment,
    requestedLookbackDays,
    availableLookbackDays: availableLookbackDaysFor(depth),
    dataDepthStatus: depth.depthStatus,
    appendJournal: false,
    researchOnly: true
  });
  assert.equal(suite.assertIctReplayOutputIsCompact(report).ok, true, `${window.id} replay output must stay compact`);
  return decisionPairsFor(suite, report.results ?? []);
};

const pairKeyFor = (pair) =>
  [
    pair.result.strategyId,
    pair.result.tradePath?.signalTime,
    pair.result.side,
    pair.result.setup,
    pair.decision?.status,
    pair.result.tradePath?.target,
    pair.result.tradePath?.invalidation
  ].join("|");

const uniquePairs = (pairs) => {
  const byKey = new Map();
  for (const pair of pairs) {
    byKey.set(pairKeyFor(pair), pair);
  }
  return [...byKey.values()];
};

const filterPairsInWindow = (pairs, window) => {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  return pairs.filter((pair) => {
    const timestamp = signalTimeMsFor(pair.result);
    return timestamp >= from && timestamp < to;
  });
};

const windowReportFor = (suite, pairs, window, randomSeed, alreadyWindowScoped = false) => {
  const windowPairs = alreadyWindowScoped ? pairs : filterPairsInWindow(pairs, window);
  const cmdPairs = windowPairs.filter((pair) => isCmd(pair.result));
  const cmdResearchPairs = cmdPairs.filter((pair) => pair.result.decision === "research_only");
  const paperResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "paper_watchlist_candidate").map((pair) => pair.result);
  const metrics = metricsFor(paperResults);
  const monteCarlo = monteCarloFor(suite, paperResults, randomSeed);
  return {
    id: window.id,
    from: window.from,
    to: window.to,
    cmdDetectedCount: cmdPairs.filter((pair) => pair.result.modelDetected).length,
    cmdResearchCandidates: cmdResearchPairs.length,
    cmdPaperWatchlistCandidates: paperResults.length,
    targetFirstRate: metrics.targetFirstRate,
    invalidationFirstRate: metrics.invalidationFirstRate,
    partialCount: metrics.partialCount,
    stalledCount: metrics.stalledCount,
    averageRr: metrics.averageRr,
    medianRr: metrics.medianRr,
    monteCarlo,
    riskOfRuinPct: monteCarlo.riskOfRuinPct,
    dateConcentrationShare: metrics.dateConcentrationShare,
    sideDistribution: metrics.countBySide,
    targetTypeDistribution: metrics.countByTargetType,
    invalidationTypeDistribution: metrics.countByInvalidationType,
    tradingDateDistribution: metrics.countByTradingDate
  };
};

const classifyCmdRobustness = ({ overallMetrics, rollingReports }) => {
  const totalPaper = overallMetrics.count;
  const activeWindows = rollingReports.filter((report) => report.cmdPaperWatchlistCandidates > 0);
  const activeWindowCount = activeWindows.length;
  const minActiveTargetFirstRate = activeWindows.length ? Math.min(...activeWindows.map((report) => report.targetFirstRate)) : 0;
  const maxWindowShare = totalPaper
    ? round(Math.max(0, ...activeWindows.map((report) => report.cmdPaperWatchlistCandidates)) / totalPaper, 4)
    : 0;
  const topDateShare = overallMetrics.dateConcentrationShare;
  const uniqueTradingDates = Object.keys(overallMetrics.countByTradingDate).filter((date) => date !== "unknown").length;
  const unstableInvalidation = overallMetrics.invalidationFirstRate > 0.2 || minActiveTargetFirstRate < 0.55;

  if (totalPaper < 8) return "insufficient_data";
  if (topDateShare >= 0.6 || uniqueTradingDates <= 2 || activeWindowCount <= 1) return "overfit_risk";
  if (unstableInvalidation) return "unstable";
  if (totalPaper < 30 || activeWindowCount < 3) return "promising_but_small_sample";
  if (overallMetrics.targetFirstRate >= 0.7 && minActiveTargetFirstRate >= 0.6 && overallMetrics.invalidationFirstRate <= 0.15) return "robust";
  return "unstable";
};

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const depth = await fetchChunkedReplayCandles({
    requestedSymbol,
    brokerSymbol,
    timeframe: primaryTimeframe,
    limit: limitPerChunk
  });
  const htfDepths = {};
  const source = makeSource(depth);
  globalThis.__ICT_CMD_OOS_TEST_SOURCES = new Map([[source.sourceId, source]]);

  const rollingWindows = buildRollingWindows(depth.firstTimestamp, depth.lastTimestamp);
  const halfWindows = buildHalfWindows(depth.firstTimestamp, depth.lastTimestamp);
  const rollingPairSets = rollingWindows.map((window, index) => ({
    window,
    pairs: runReplayPairsForWindow(
      suite,
      depth,
      htfDepths,
      window,
      index === rollingWindows.length - 1 ? currentEvidenceReplayWindows : maxReplayWindows
    )
  }));
  const halfPairSets = halfWindows.map((window) => ({
    window,
    pairs: runReplayPairsForWindow(suite, depth, htfDepths, window, window.id === "second_half" ? currentEvidenceReplayWindows : maxReplayWindows)
  }));
  const pairs = uniquePairs([...halfPairSets.flatMap((item) => item.pairs), ...rollingPairSets.flatMap((item) => item.pairs)]);
  const cmdPairs = pairs.filter((pair) => isCmd(pair.result));
  const cmdResearchPairs = cmdPairs.filter((pair) => pair.result.decision === "research_only");
  const cmdPaperResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "paper_watchlist_candidate").map((pair) => pair.result);
  const cmdApprovedResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "approved_research_candidate").map((pair) => pair.result);
  const cmdWatchlistResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "watchlist_candidate").map((pair) => pair.result);
  const cmdRejectedResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "rejected_candidate").map((pair) => pair.result);
  const cmdNoTradeResults = cmdPairs.filter((pair) => pair.decision?.status === "no_trade" || pair.result.decision === "no_trade").map((pair) => pair.result);

  const rollingReports = rollingPairSets.map(({ pairs, window }, index) =>
    windowReportFor(suite, pairs, window, 1200 + index * 17, true)
  );
  const halfReports = halfPairSets.map(({ pairs, window }, index) =>
    windowReportFor(suite, pairs, window, 2400 + index * 29, true)
  );
  const overallMetrics = metricsFor(cmdPaperResults);
  const overallMonteCarlo = monteCarloFor(suite, cmdPaperResults, 909);
  const robustness = classifyCmdRobustness({ overallMetrics, rollingReports });
  const activeRollingWindows = rollingReports.filter((report) => report.cmdPaperWatchlistCandidates > 0);
  const stableHighTargetFirst =
    activeRollingWindows.length >= 2 &&
    activeRollingWindows.every((report) => report.targetFirstRate >= 0.65) &&
    overallMetrics.dateConcentrationShare < 0.6;

  const report = {
    status: "passed",
    diagnostic: "ict_cmd_paper_watchlist_oos_90d",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      htfTimeframes: [],
      requestedLookbackDays,
      availableLookbackDays: availableLookbackDaysFor(depth),
      candleCount: depth.candleCount,
      firstTimestamp: depth.firstTimestamp,
      lastTimestamp: depth.lastTimestamp,
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    scanMode: {
      mode: "bounded_per_window_replay",
      rollingWindowDays,
      rollingStepDays,
      maxReplayWindowsPerWindow: maxReplayWindows,
      currentEvidenceReplayWindows,
      note: "Each rolling and half-period segment is evaluated directly from its own candle slice; raw candles remain internal."
    },
    counts: {
      totalReplaySignals: pairs.length,
      cmdDetectedModels: cmdPairs.filter((pair) => pair.result.modelDetected).length,
      cmdResearchCandidates: cmdResearchPairs.length,
      cmdApprovedCandidates: cmdApprovedResults.length,
      cmdPaperWatchlistCandidates: cmdPaperResults.length,
      cmdOrdinaryWatchlistCandidates: cmdWatchlistResults.length,
      cmdRejectedCandidates: cmdRejectedResults.length,
      cmdNoTradeCandidates: cmdNoTradeResults.length
    },
    overallPaperWatchlist: {
      ...overallMetrics,
      monteCarlo: overallMonteCarlo
    },
    rollingValidation: {
      windowDays: rollingWindowDays,
      stepDays: rollingStepDays,
      windowCount: rollingReports.length,
      activeWindowCount: activeRollingWindows.length,
      windows: rollingReports
    },
    halfComparison: {
      windows: halfReports
    },
    robustness: {
      classification: robustness,
      rules: {
        robust: "Multiple active windows, acceptable target-first rate, low invalidation-first rate, and no dominant date concentration.",
        promising_but_small_sample: "Strong target-first behavior, but sample/window count remains too small.",
        unstable: "Rolling windows show weak target-first or elevated invalidation-first behavior.",
        overfit_risk: "Most CMD paper-watchlist evidence is concentrated in one date/window.",
        insufficient_data: "Too few CMD paper-watchlist candidates for OOS validation."
      },
      concentration: {
        topTradingDateShare: overallMetrics.dateConcentrationShare,
        uniqueTradingDates: Object.keys(overallMetrics.countByTradingDate).filter((date) => date !== "unknown").length,
        activeRollingWindowCount: activeRollingWindows.length
      }
    },
    answers: {
      wasPriorTargetFirstStable: stableHighTargetFirst
        ? "The 88.89% target-first result appears directionally stable across active rolling windows, but remains research-only."
        : "The 88.89% target-first result is not yet proven stable; window/date concentration or sample size remains a material concern.",
      windowsProducedCandidates: activeRollingWindows.map((window) => ({
        id: window.id,
        from: window.from,
        to: window.to,
        candidates: window.cmdPaperWatchlistCandidates,
        targetFirstRate: window.targetFirstRate
      })),
      performanceConcentrated: overallMetrics.dateConcentrationShare >= 0.6,
      shouldCmdRemainPaperWatchlist:
        ["robust", "promising_but_small_sample", "overfit_risk"].includes(robustness) && cmdPaperResults.length > 0,
      shouldCmdBeNarrowedFurther: ["overfit_risk", "unstable"].includes(robustness),
      readyForLiveExecution: false,
      readyForContinuedPaperOnlyTracking: cmdPaperResults.length > 0 && robustness !== "unstable",
      recommendation:
        robustness === "robust"
          ? "Keep CMD in strict paper-watchlist tracking; do not promote to approved without separate readiness gates."
          : robustness === "promising_but_small_sample"
            ? "Keep CMD paper-only and collect more independent windows before any promotion discussion."
            : robustness === "overfit_risk"
              ? "Keep CMD paper-only, narrow or tag the concentrated conditions, and require more independent dates."
              : robustness === "unstable"
                ? "Do not expand CMD; inspect failed windows and tighten setup filters."
                : "Collect more CMD samples before drawing a quality conclusion."
    },
    safetyChecks: {
      compactOutputOnly: true,
      rawCandlesExposed: false,
      rawSnapshotsExposed: false,
      secretsExposed: false,
      accountDataExposed: false,
      orderDataExposed: false,
      positionDataExposed: false,
      allCmdPaperResearchOnly: cmdPaperResults.every((result) => result.researchOnly === true),
      allCmdPaperExecutionDisabled: cmdPaperResults.every((result) => result.executionAllowed !== true),
      allCmdPaperHaveTargetInvalidationRr: cmdPaperResults.every((result) => hasTarget(result) && hasInvalidation(result) && hasRr(result)),
      allCmdPaperDirectionAligned: cmdPaperResults.every(sessionConfirmsDirection),
      rangeBoundExcluded: !cmdPaperResults.some((result) => result.sessionNarrativeProfile === "range_bound"),
      approvedPromotionIntroduced: false,
      readinessPromotionIntroduced: false,
      liveExecutionReady: false
    },
    safety,
    authority
  };

  assertSafeReport(report);
  assert.equal(report.safetyChecks.rawCandlesExposed, false);
  assert.equal(report.safetyChecks.rawSnapshotsExposed, false);
  assert.equal(report.safetyChecks.secretsExposed, false);
  assert.equal(report.safetyChecks.accountDataExposed, false);
  assert.equal(report.safetyChecks.orderDataExposed, false);
  assert.equal(report.safetyChecks.positionDataExposed, false);
  assert.equal(report.safetyChecks.allCmdPaperResearchOnly, true);
  assert.equal(report.safetyChecks.allCmdPaperExecutionDisabled, true);
  assert.equal(report.safetyChecks.allCmdPaperHaveTargetInvalidationRr, true);
  assert.equal(report.safetyChecks.allCmdPaperDirectionAligned, true);
  assert.equal(report.safetyChecks.rangeBoundExcluded, true);
  assert.equal(report.safetyChecks.approvedPromotionIntroduced, false);
  assert.equal(report.safetyChecks.readinessPromotionIntroduced, false);
  assert.equal(report.safetyChecks.liveExecutionReady, false);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT CMD paper-watchlist OOS diagnostic failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
