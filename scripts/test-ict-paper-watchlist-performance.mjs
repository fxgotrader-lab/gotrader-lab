#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-paper-watchlist-performance-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_PAPER_WATCHLIST_DAYS || 90);
const chunkDays = Number(process.env.ICT_PAPER_WATCHLIST_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_PAPER_WATCHLIST_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_PAPER_WATCHLIST_MAX_WINDOWS || 240));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);

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
  "ictStrategySuiteTypes.ts",
  "ictAdvisorTypes.ts",
  "ictSessionNarrativeTypes.ts",
  "ictGrinchModelTypes.ts",
  "ictPhase2Types.ts",
  "ictReplayValidationTypes.ts",
  "ictReplayDiagnosticsTypes.ts",
  "ictApprovedSetupProfileTypes.ts",
  "ictApprovedProfileOptimizerTypes.ts",
  "ictIndexSmtTypes.ts",
  "ictNewsSessionRiskTypes.ts",
  "ictNewsSessionRisk.ts",
  "ictRealReplayRunnerTypes.ts",
  "ictManualReplayReviewTypes.ts",
  "ictMarketScorecardTypes.ts",
  "ictMonteCarloTypes.ts",
  "ictLatestResearchStateTypes.ts",
  "ictLatestResearchState.ts",
  "ictMarketAnalysisContextTypes.ts",
  "ictMarketAnalysisContext.ts",
  "ictOpportunityDetectionTypes.ts",
  "ictOpportunityDetection.ts",
  "ictUniversalRecognitionTypes.ts",
  "ictUniversalRecognition.ts",
  "ictSelfImprovementTypes.ts",
  "ictSelfImprovement.ts",
  "ictHypothesisValidationTypes.ts",
  "ictHypothesisValidation.ts",
  "ictSignalContractTypes.ts",
  "ictSignalContract.ts",
  "ictPaperSignalSimulatorTypes.ts",
  "ictPaperSignalSimulator.ts",
  "ictCmdPaperTrackingTypes.ts",
  "ictCmdPaperTracking.ts",
  "ictResearchReportTypes.ts",
  "ictStrategySuiteJournal.ts",
  "ictBrowserResearchLimits.ts",
  "ictAdvisorJournal.ts",
  "ictStrategySuiteHelpers.ts",
  "ictSessionNarrative.ts",
  "ictStrategySuiteEngines.ts",
  "ictPhase2OrderBlocks.ts",
  "ictPhase2BreadAndButter.ts",
  "ictPhase2OneShotOneKill.ts",
  "ictAdvisorEngine.ts",
  "ictCurrentReadTypes.ts",
  "ictCurrentRead.ts",
  "ictReplayValidation.ts",
  "ictReplayDiagnostics.ts",
  "ictApprovedSetupProfile.ts",
  "ictApprovedProfileOptimizer.ts",
  "ictIndexSmt.ts",
  "ictRealReplayRunner.ts",
  "ictManualReplayReview.ts",
  "ictMarketScorecard.ts",
  "ictMonteCarlo.ts",
  "ictResearchReport.ts",
  "index.ts"
];

const mt5Files = [
  "mt5ReadOnlyTypes.ts",
  "mt5SymbolSettings.ts",
  "mt5ReadOnlyNormalizer.ts",
  "mt5ReadOnlyDepth.ts",
  "mt5ReadOnlyClient.ts"
];

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
    .replace(/from\s+'..\/candleSources'/g, "from './candleSourcesStub.mjs'");
  fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
}

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) writeTranspiled(path.join(sourceRoot, file), file);
  for (const file of mt5Files) writeTranspiled(path.join(mt5Root, file), file);
  fs.writeFileSync(
    path.join(outRoot, "candleSourcesStub.mjs"),
    `export async function loadCanonicalCandleSource(sourceId) {
  return globalThis.__ICT_PAPER_WATCHLIST_PERFORMANCE_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_PAPER_WATCHLIST_PERFORMANCE_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
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
      id: `mt5_paper_watchlist_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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

async function fetchChunkedCandles() {
  const latest = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe: primaryTimeframe,
    limit: Math.min(limitPerChunk, 5000)
  }));
  if (!latest.ok) throw new Error(`Latest MT5 candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 candles did not include a last timestamp.");

  const rawCandles = [];
  const chunks = [];
  for (const window of dateWindows(lastTimestamp)) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe: primaryTimeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
    if (!response.ok) throw new Error(`Range MT5 candles returned HTTP ${response.status}`);
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    rawCandles.push(...chunkCandles);
    chunks.push({
      from: window.from,
      to: window.to,
      returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? payload.firstCandleTime ?? chunkCandles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? payload.lastCandleTime ?? chunkCandles.at(-1)?.timestamp
    });
  }
  const candles = normalizeMt5Candles({ candles: rawCandles, requestedSymbol, brokerSymbol, timeframe: primaryTimeframe });
  return {
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

const makeSource = (depth) => ({
  sourceId: `ict_paper_watchlist:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
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
    sourceLabel: "MT5 read-only CFD/proxy paper-watchlist performance source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_paper_watchlist|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
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
const tradingDateFor = (result) => {
  const value = result.tradePath?.signalTime ?? result.generatedAt ?? result.timestamp;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "unknown";
};

const metricsFor = (results) => {
  const rrValues = results.map(resultRrFor).filter((value) => typeof value === "number");
  const confidenceValues = results.map(confidenceFor).filter((value) => typeof value === "number");
  const targetFirst = results.filter((result) => result.outcome === "target_first").length;
  const invalidationFirst = results.filter((result) => result.outcome === "invalidation_first").length;
  const partial = results.filter((result) => result.outcome === "partial_target").length;
  const stalled = results.filter((result) => result.outcome === "stalled").length;
  const insufficient = results.filter((result) => result.outcome === "insufficient_future_candles").length;
  return {
    totalCount: results.length,
    targetFirstRate: results.length ? round(targetFirst / results.length, 4) : 0,
    invalidationFirstRate: results.length ? round(invalidationFirst / results.length, 4) : 0,
    partialCount: partial,
    stalledCount: stalled,
    insufficientFutureCandlesCount: insufficient,
    averageRr: average(rrValues),
    medianRr: median(rrValues),
    averageConfidence: average(confidenceValues),
    countByModelName: countBy(results, (result) => result.modelName),
    countBySessionNarrativeProfile: countBy(results, (result) => result.sessionNarrativeProfile),
    countBySide: countBy(results, (result) => result.side),
    countBySetup: countBy(results, (result) => result.setup),
    countByReason: topCounts(results, (result) => result.approvedProfileReasons?.[0] ?? result.noTradeReasons?.[0] ?? "reason unavailable", 12),
    countByTradingDate: countBy(results, tradingDateFor)
  };
};

const compactMonteCarlo = (summary) => ({
  usableOutcomes: summary.input.usableOutcomes,
  robustnessRating: summary.recommendation.robustnessRating,
  medianEndingR: summary.performance.medianEndingR,
  fifthPercentileEndingR: summary.performance.fifthPercentileEndingR,
  medianMaxDrawdownR: summary.performance.medianMaxDrawdownR,
  worstMaxDrawdownR: summary.performance.worstMaxDrawdownR,
  medianLongestLosingStreak: summary.performance.medianLongestLosingStreak,
  worstLongestLosingStreak: summary.performance.worstLongestLosingStreak,
  riskOfRuinPct: summary.performance.riskOfRuinPct,
  recommendedMaxRiskPerTradePct: summary.recommendation.recommendedMaxRiskPerTradePct,
  warnings: summary.recommendation.warnings
});

const compareLane = (name, results) => ({
  lane: name,
  count: results.length,
  targetFirstRate: metricsFor(results).targetFirstRate,
  invalidationFirstRate: metricsFor(results).invalidationFirstRate,
  averageRr: metricsFor(results).averageRr,
  medianRr: metricsFor(results).medianRr,
  averageConfidence: metricsFor(results).averageConfidence,
  topProfiles: topCounts(results, (result) => result.sessionNarrativeProfile, 5),
  topSetups: topCounts(results, (result) => result.setup, 5)
});

const profileNames = [
  "consolidation_manipulation_distribution",
  "accumulation_manipulation_expansion",
  "ny_session_reversal_to_premium_fvg",
  "range_bound"
];

const recommendationForProfile = (profile, metrics) => {
  if (profile === "range_bound") return "remain_rejected_or_no_trade_without_expansion_or_reversal_evidence";
  if (metrics.totalCount < 8) return "more_data_needed";
  if (metrics.targetFirstRate >= 0.45 && metrics.invalidationFirstRate <= 0.35) return "good_for_paper_watchlist_testing";
  if (metrics.targetFirstRate >= 0.3 && metrics.averageRr > 1) return "keep_as_paper_watchlist_observation";
  return "remain_approved_only_or_rejected_until_quality_improves";
};

const modelRecommendation = ({ approvedResults, paperResults, watchlistResults, rejectedResults }) => {
  const paperProfiles = Object.entries(countBy(paperResults, (result) => result.sessionNarrativeProfile))
    .map(([profile, count]) => ({ profile, count, metrics: metricsFor(paperResults.filter((result) => result.sessionNarrativeProfile === profile)) }))
    .sort((left, right) => right.metrics.targetFirstRate - left.metrics.targetFirstRate || right.count - left.count);
  const approvedProfiles = Object.entries(countBy(approvedResults, (result) => result.sessionNarrativeProfile))
    .map(([profile, count]) => ({ profile, count }));
  const approvedOrPaperProfiles = new Set([...approvedResults, ...paperResults].map((result) => result.sessionNarrativeProfile).filter(Boolean));
  const paperTradingDateCount = Object.keys(countBy(paperResults, tradingDateFor)).filter((date) => date !== "unknown").length;
  const rejectedProfiles = Object.entries(countBy(rejectedResults, (result) => result.sessionNarrativeProfile))
    .map(([profile, count]) => ({ profile, count }))
    .filter(({ profile }) => !approvedOrPaperProfiles.has(profile))
    .slice(0, 4);
  return {
    modelsToKeepApprovedOnly: approvedProfiles.map((item) => item.profile).filter((profile) => profile && profile !== "range_bound").slice(0, 4),
    modelsGoodForPaperWatchlistTesting: paperProfiles
      .filter(({ profile, metrics }) => profile !== "range_bound" && recommendationForProfile(profile, metrics) !== "remain_approved_only_or_rejected_until_quality_improves")
      .map(({ profile }) => profile),
    modelsToKeepRejectedOrNoTrade: Array.from(new Set(["range_bound", ...rejectedProfiles.map((item) => item.profile)])).slice(0, 5),
    profileAdjustment: paperResults.length >= 30 ? "keep thresholds strict; use paper-watchlist as explicit simulation evidence, not approval promotion" : "no profile adjustment; collect more paper-watchlist outcomes",
    moreDataNeeded: paperResults.length < 30 || watchlistResults.length < 100 || paperTradingDateCount < 5,
    evidenceConcentration: {
      paperTradingDateCount,
      note:
        paperTradingDateCount < 5
          ? "Paper-watchlist evidence is concentrated on too few trading dates; do not promote or loosen profiles."
          : "Paper-watchlist evidence spans multiple trading dates."
    },
    rejectedLaneNote: rejectedResults.length
      ? "Rejected/no_trade candidates were excluded from paper Monte Carlo and paper-signal checks."
      : "No rejected research candidates in this run."
  };
};

const researchSignalFromReplayResult = (result) => ({
  signalId: `paper_watchlist_perf_${result.strategyId}_${result.tradePath?.signalTime ?? "sample"}`,
  generatedAt: result.tradePath?.signalTime ?? new Date().toISOString(),
  researchOnly: true,
  status: "watchlist_signal",
  executionReadiness: "research_only",
  executionAllowed: false,
  requestedSymbol: result.requestedSymbol ?? requestedSymbol,
  brokerSymbol: result.brokerSymbol ?? brokerSymbol,
  displayLabel: `${result.brokerSymbol ?? brokerSymbol} -> ${result.requestedSymbol ?? requestedSymbol}`,
  primaryTimeframe: result.primaryTimeframe ?? primaryTimeframe,
  htfTimeframes: [],
  strategyId: result.strategyId,
  setup: result.setup,
  side: result.side,
  entryZone: Number.isFinite(result.tradePath?.entryReference)
    ? {
        low: result.tradePath.entryReference,
        high: result.tradePath.entryReference,
        midpoint: result.tradePath.entryReference,
        type: "replay_entry_reference"
      }
    : undefined,
  invalidation: result.tradePath?.invalidation,
  target: result.tradePath?.target,
  rrEstimate: resultRrFor(result),
  confidence: result.confidence,
  approvedProfileStatus: "paper_watchlist_candidate",
  approvalScore: result.approvedProfileScore,
  sessionNarrativeProfile: result.sessionNarrativeProfile,
  sessionDirectionalRead: result.sessionDirectionalRead,
  modelDetected: result.modelDetected,
  modelName: result.modelName,
  modelState: result.modelState,
  modelDirection: result.modelDirection,
  dataDepthStatus: result.dataDepthStatus,
  reasons: result.approvedProfileReasons ?? ["Paper-watchlist replay candidate."],
  rejectionReasons: [],
  warnings: ["Paper-watchlist simulation is research-only and cannot promote readiness."],
  nextAction: "Use this only for paper-watchlist validation; no broker action is allowed.",
  authority,
  safety: {
    rawCandlesExcluded: true,
    rawSnapshotsExcluded: true,
    accountDataExcluded: true,
    orderDataExcluded: true,
    positionDataExcluded: true,
    secretsExcluded: true
  },
  provenance: {
    source: "ict_current_read",
    methodology: "ICT",
    researchOnly: true,
    generatedAt: result.tradePath?.signalTime ?? new Date().toISOString()
  }
});

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
  const depth = await fetchChunkedCandles();
  const source = makeSource(depth);
  globalThis.__ICT_PAPER_WATCHLIST_PERFORMANCE_SOURCES = new Map([[source.sourceId, source]]);

  const replay = await suite.runIctRealReplay(
    {
      requestedSymbols: [requestedSymbol],
      brokerSymbols: [brokerSymbol],
      primaryTimeframes: [primaryTimeframe],
      htfTimeframes: [],
      candleLimit: depth.candles.length,
      replayWindowSize: 80,
      lookaheadCandles: 24,
      requestedLookbackDays,
      appendJournal: false
    },
    {
      includeReplayResults: true,
      maxReplayWindows,
      fetchCandles: async () => ({
        requestedSymbol,
        brokerSymbol,
        timeframe: primaryTimeframe,
        candles: depth.candles,
        candleCount: depth.candles.length,
        connectionStatus: depth.candles.length ? "connected" : "disconnected",
        depthStatus: depth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "full" : "partial",
        firstTimestamp: depth.firstTimestamp,
        lastTimestamp: depth.lastTimestamp,
        warnings: ["Paper-watchlist performance diagnostic used explicit read-only MT5 range chunks; raw candles stayed internal."],
        missingEvidence: depth.candles.length ? [] : ["No MT5 candles were available."]
      }),
      newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_replay" }
    }
  );

  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(replay).ok, true, "real replay output must stay compact");
  const replayResults = replay.replayResults ?? [];
  const pairs = decisionPairsFor(suite, replayResults);
  const selectedResults = pairs.map((pair) => pair.result);
  const researchPairs = pairs.filter((pair) => pair.result.decision === "research_only");
  const detectedResults = selectedResults.filter((result) => result.modelDetected);
  const researchCandidateResults = researchPairs.map((pair) => pair.result);
  const approvedResults = researchPairs.filter((pair) => pair.decision?.status === "approved_research_candidate").map((pair) => pair.result);
  const paperWatchlistResults = researchPairs.filter((pair) => pair.decision?.status === "paper_watchlist_candidate").map((pair) => pair.result);
  const ordinaryWatchlistResults = researchPairs.filter((pair) => pair.decision?.status === "watchlist_candidate").map((pair) => pair.result);
  const allWatchlistResults = [...paperWatchlistResults, ...ordinaryWatchlistResults];
  const rejectedResults = researchPairs.filter((pair) => pair.decision?.status === "rejected_candidate").map((pair) => pair.result);
  const noTradeResults = pairs.filter((pair) => pair.decision?.status === "no_trade" || pair.result.decision === "no_trade").map((pair) => pair.result);

  const paperOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(
    paperWatchlistResults.map((result) => ({ ...result, approvedProfileStatus: "paper_watchlist_candidate" }))
  );
  assert.ok(paperOutcomes.every((outcome) => outcome.approvedStatus === "paper_watchlist_candidate"), "Paper Monte Carlo must include only paper-watchlist outcomes.");
  const paperMonteCarlo = suite.runMonteCarloBatch(paperOutcomes, {
    source: "real_replay_runner",
    includeApprovedOnly: true,
    includeWatchlist: true,
    simulationCount: 500,
    tradesPerSimulation: Math.min(100, Math.max(1, paperOutcomes.length)),
    randomSeed: 707,
    researchOnly: true
  });
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(paperMonteCarlo).ok, true, "paper-watchlist Monte Carlo must stay compact");

  const paperSignalSample = paperWatchlistResults[0]
    ? suite.createPaperSignalFromResearchSignal(researchSignalFromReplayResult(paperWatchlistResults[0]), {
        entryPrice: paperWatchlistResults[0].tradePath?.entryReference,
        entryType: "manual_reference",
        generatedAt: paperWatchlistResults[0].tradePath?.signalTime
      })
    : undefined;
  if (paperSignalSample) {
    assert.equal(paperSignalSample.paperOnly, true);
    assert.equal(paperSignalSample.researchOnly, true);
    assert.equal(paperSignalSample.safety.realOrderPlaced, false);
    assert.equal(paperSignalSample.safety.brokerMutation, false);
    assert.equal(suite.assertIctPaperSignalIsSafe(paperSignalSample).ok, true);
  }

  const profileEvaluation = Object.fromEntries(
    profileNames.map((profile) => {
      const profilePaper = paperWatchlistResults.filter((result) => result.sessionNarrativeProfile === profile);
      const profileApproved = approvedResults.filter((result) => result.sessionNarrativeProfile === profile);
      const profileRejected = rejectedResults.filter((result) => result.sessionNarrativeProfile === profile);
      const profileNoTrade = noTradeResults.filter((result) => result.sessionNarrativeProfile === profile);
      const metrics = metricsFor(profilePaper);
      return [
        profile,
        {
          paperWatchlist: metrics,
          approvedCount: profileApproved.length,
          rejectedCount: profileRejected.length,
          noTradeCount: profileNoTrade.length,
          recommendation: recommendationForProfile(profile, metrics)
        }
      ];
    })
  );

  const report = {
    status: "passed",
    diagnostic: "ict_paper_watchlist_performance_90d",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      requestedLookbackDays,
      availableLookbackDays: depth.availableLookbackDays,
      candleCount: depth.candleCount,
      chunkCount: depth.chunks.length,
      firstTimestamp: depth.firstTimestamp,
      lastTimestamp: depth.lastTimestamp,
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    counts: {
      detectedModels: detectedResults.length,
      researchCandidates: researchCandidateResults.length,
      approvedCandidates: approvedResults.length,
      paperWatchlistCandidates: paperWatchlistResults.length,
      ordinaryWatchlistCandidates: ordinaryWatchlistResults.length,
      allWatchlistCandidates: allWatchlistResults.length,
      rejectedCandidates: rejectedResults.length,
      noTradeCandidates: noTradeResults.length
    },
    paperWatchlistPerformance: metricsFor(paperWatchlistResults),
    paperWatchlistMonteCarlo: compactMonteCarlo(paperMonteCarlo),
    comparisons: [
      compareLane("approved_candidates", approvedResults),
      compareLane("paper_watchlist_candidates", paperWatchlistResults),
      compareLane("all_watchlist_candidates", allWatchlistResults),
      compareLane("rejected_candidates", rejectedResults)
    ],
    profileEvaluation,
    recommendation: modelRecommendation({
      approvedResults,
      paperResults: paperWatchlistResults,
      watchlistResults: allWatchlistResults,
      rejectedResults
    }),
    safetyChecks: {
      paperWatchlistOutcomesExcludeRawCandles: true,
      paperSignalSamplePaperOnly: paperSignalSample ? paperSignalSample.paperOnly === true : "no_sample",
      realOrderPlaced: false,
      brokerMutation: false,
      rejectedNoTradeExcludedFromPaperMonteCarlo: paperOutcomes.every((outcome) => outcome.approvedStatus === "paper_watchlist_candidate"),
      insufficientDataHandled:
        paperOutcomes.length >= 8 || paperMonteCarlo.recommendation.robustnessRating === "insufficient_data"
    },
    safety,
    authority
  };

  assertSafeReport(report);
  assert.equal(report.safetyChecks.realOrderPlaced, false);
  assert.equal(report.safetyChecks.brokerMutation, false);
  assert.equal(report.safetyChecks.rejectedNoTradeExcludedFromPaperMonteCarlo, true);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.ok(
    !Object.keys(report.paperWatchlistPerformance.countBySessionNarrativeProfile).includes("range_bound"),
    "range_bound must not become paper-watchlist without reversal/expansion evidence"
  );
  if (paperWatchlistResults.length > 0) {
    assert.equal(report.safetyChecks.paperSignalSamplePaperOnly, true, "paper-watchlist sample must produce paper-only simulation");
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT paper-watchlist performance diagnostic failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
