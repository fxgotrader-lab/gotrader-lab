#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-cmd-paper-watchlist-diagnostic-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_CMD_WATCHLIST_DAYS || 90);
const chunkDays = Number(process.env.ICT_CMD_WATCHLIST_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_CMD_WATCHLIST_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_CMD_WATCHLIST_MAX_WINDOWS || 1000));
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
  return globalThis.__ICT_CMD_WATCHLIST_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_CMD_WATCHLIST_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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
      id: `mt5_cmd_watchlist_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
    warnings: [`Explicit CMD paper-watchlist diagnostic used ${chunkReports.length} read-only range chunk(s); raw candles stay internal.`],
    missingEvidence: candles.length ? [] : ["No usable MT5 range candles returned for CMD diagnostic."]
  };
}

const makeSource = (depth) => ({
  sourceId: `ict_cmd_watchlist:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
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
    sourceLabel: "MT5 read-only CFD/proxy CMD paper-watchlist diagnostic source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_cmd_watchlist|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
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
const targetDistanceFor = (result) =>
  [result.tradePath?.entryReference, result.tradePath?.target].every(Number.isFinite)
    ? Math.abs(result.tradePath.target - result.tradePath.entryReference)
    : undefined;
const invalidationDistanceFor = (result) =>
  [result.tradePath?.entryReference, result.tradePath?.invalidation].every(Number.isFinite)
    ? Math.abs(result.tradePath.entryReference - result.tradePath.invalidation)
    : undefined;
const tradingDateFor = (result) => {
  const parsed = Date.parse(result.tradePath?.signalTime ?? result.generatedAt ?? result.timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "unknown";
};
const isCmd = (result) =>
  result.sessionNarrativeProfile === "consolidation_manipulation_distribution" ||
  result.modelName === "consolidation_manipulation_distribution";
const sessionConfirmsDirection = (result) =>
  (result.sessionDirectionalRead === "bullish" && result.side === "long") ||
  (result.sessionDirectionalRead === "bearish" && result.side === "short");
const sessionContradictsDirection = (result) =>
  (result.sessionDirectionalRead === "bullish" && result.side === "short") ||
  (result.sessionDirectionalRead === "bearish" && result.side === "long");
const hasCmdTargetContext = (result) => result.fvgTargetDetected === true || Boolean(result.liquidityTargetType);
const hasCmdMitigationOrExpansion = (result) =>
  result.sessionMitigationDetected === true ||
  (result.fvgStatus && result.fvgStatus !== "not_applicable") ||
  Boolean(result.liquidityTargetType) ||
  result.setup?.includes("displacement") ||
  result.setup?.includes("sweep");
const riskBlocked = (result) =>
  ["reject_candidate", "no_trade"].includes(result.riskGovernorAction ?? "") ||
  ["blocked", "high"].includes(result.newsRiskLevel ?? "") ||
  result.sessionRiskState === "avoid";

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
const entryTypeFor = (result) => (Number.isFinite(result.tradePath?.entryReference) ? "replay_entry_reference" : "missing");

const metricsFor = (results) => {
  const rrValues = results.map(resultRrFor).filter((value) => typeof value === "number");
  const confidenceValues = results.map(confidenceFor).filter((value) => typeof value === "number");
  const targetDistances = results.map(targetDistanceFor).filter((value) => typeof value === "number");
  const invalidationDistances = results.map(invalidationDistanceFor).filter((value) => typeof value === "number");
  const targetFirst = results.filter((result) => result.outcome === "target_first").length;
  const invalidationFirst = results.filter((result) => result.outcome === "invalidation_first").length;
  const partial = results.filter((result) => result.outcome === "partial_target").length;
  const stalled = results.filter((result) => result.outcome === "stalled").length;
  return {
    count: results.length,
    targetFirstRate: results.length ? round(targetFirst / results.length, 4) : 0,
    invalidationFirstRate: results.length ? round(invalidationFirst / results.length, 4) : 0,
    partialCount: partial,
    stalledCount: stalled,
    averageRr: average(rrValues),
    medianRr: median(rrValues),
    averageConfidence: average(confidenceValues),
    averageTargetDistance: average(targetDistances),
    averageInvalidationDistance: average(invalidationDistances),
    countByModelName: countBy(results, (result) => result.modelName ?? "unknown"),
    countBySessionNarrativeProfile: countBy(results, (result) => result.sessionNarrativeProfile ?? "unknown"),
    countByModelState: countBy(results, (result) => result.modelState ?? "unknown"),
    countBySide: countBy(results, (result) => result.side ?? "unknown"),
    countBySetup: countBy(results, (result) => result.setup ?? "unknown"),
    countByReason: topCounts(results, (result) => result.approvedProfileReasons?.[0] ?? result.noTradeReasons?.[0] ?? "reason unavailable", 12),
    countByTradingDate: countBy(results, tradingDateFor),
    countByTargetType: countBy(results, targetTypeFor),
    countByInvalidationType: countBy(results, invalidationTypeFor),
    countByEntryType: countBy(results, entryTypeFor),
    missingTargetCount: results.filter((result) => !hasTarget(result)).length,
    missingInvalidationCount: results.filter((result) => !hasInvalidation(result)).length,
    missingRrCount: results.filter((result) => !hasRr(result)).length
  };
};

const cmdStrictEligibilityReasons = (result) => {
  const rr = resultRrFor(result);
  return [
    !isCmd(result) ? "not_cmd" : undefined,
    result.approvedProfileStatus !== "watchlist_candidate" && result.approvedProfileStatus !== "paper_watchlist_candidate"
      ? "original_status_not_watchlist_candidate"
      : undefined,
    result.modelState !== "confirmed" ? "model_not_confirmed" : undefined,
    !["long", "short"].includes(result.side) ? "direction_not_explicit" : undefined,
    !sessionConfirmsDirection(result) ? "session_direction_not_aligned_with_side" : undefined,
    hasTarget(result) ? undefined : "missing_target",
    hasInvalidation(result) ? undefined : "missing_invalidation",
    hasRr(result) ? undefined : "missing_rr",
    typeof rr === "number" && rr < 1.5 ? "rr_below_1_5" : undefined,
    !hasCmdTargetContext(result) ? "missing_first_target_or_liquidity_target" : undefined,
    !hasCmdMitigationOrExpansion(result) ? "missing_mitigation_or_sweep_displacement_context" : undefined,
    result.smtRejectsCandidate ? "smt_rejects_candidate" : undefined,
    sessionContradictsDirection(result) ? "contradictory_session_narrative" : undefined,
    riskBlocked(result) ? "risk_governor_blocked" : undefined,
    result.sessionNarrativeProfile === "range_bound" ? "range_bound_excluded" : undefined,
    result.executionAllowed === true ? "execution_allowed_violation" : undefined
  ].filter(Boolean);
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

const compactExamples = (results, limit = 8) =>
  results.slice(0, limit).map((result) => ({
    signalTime: result.tradePath?.signalTime,
    side: result.side,
    modelState: result.modelState,
    outcome: result.outcome,
    plannedRr: resultRrFor(result),
    targetType: targetTypeFor(result),
    invalidationType: invalidationTypeFor(result),
    firstReason: result.approvedProfileReasons?.[0] ?? result.noTradeReasons?.[0] ?? "reason unavailable"
  }));

const researchSignalFromReplayResult = (result) => ({
  signalId: `cmd_paper_watchlist_${result.strategyId}_${result.tradePath?.signalTime ?? "sample"}`,
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
  reasons: result.approvedProfileReasons ?? ["CMD paper-watchlist replay candidate."],
  rejectionReasons: [],
  warnings: ["CMD paper-watchlist simulation is research-only and cannot promote readiness."],
  nextAction: "Use this only for CMD paper-watchlist validation; no broker action is allowed.",
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
  const depth = await fetchChunkedReplayCandles({
    requestedSymbol,
    brokerSymbol,
    timeframe: primaryTimeframe,
    limit: limitPerChunk
  });
  const source = makeSource(depth);
  globalThis.__ICT_CMD_WATCHLIST_TEST_SOURCES = new Map([[source.sourceId, source]]);

  const replay = await suite.runIctRealReplay(
    {
      requestedSymbols: [requestedSymbol],
      brokerSymbols: [brokerSymbol],
      primaryTimeframes: [primaryTimeframe],
      htfTimeframes: ["15m", "1h"],
      candleLimit: 5000,
      replayWindowSize: 80,
      lookaheadCandles: 12,
      minRequiredCandles: 120,
      researchOnly: true
    },
    {
      appendJournal: false,
      fetchCandles: fetchChunkedReplayCandles,
      includeReplayResults: true,
      maxReplayWindows,
      newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_replay" }
    }
  );

  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(replay).ok, true, "real replay output must stay compact");
  const pairs = decisionPairsFor(suite, replay.replayResults ?? []);
  const cmdPairs = pairs.filter((pair) => isCmd(pair.result));
  const cmdResearchPairs = cmdPairs.filter((pair) => pair.result.decision === "research_only");
  const cmdResults = cmdPairs.map((pair) => pair.result);
  const cmdResearchResults = cmdResearchPairs.map((pair) => pair.result);
  const cmdApprovedResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "approved_research_candidate").map((pair) => pair.result);
  const cmdPaperResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "paper_watchlist_candidate").map((pair) => pair.result);
  const cmdOrdinaryWatchlistResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "watchlist_candidate").map((pair) => pair.result);
  const cmdAllWatchlistResults = [...cmdPaperResults, ...cmdOrdinaryWatchlistResults];
  const cmdRejectedResults = cmdResearchPairs.filter((pair) => pair.decision?.status === "rejected_candidate").map((pair) => pair.result);
  const cmdNoTradeResults = cmdPairs.filter((pair) => pair.decision?.status === "no_trade" || pair.result.decision === "no_trade").map((pair) => pair.result);
  const strictEligibleFromCurrentReport = cmdAllWatchlistResults.filter((result) => cmdStrictEligibilityReasons(result).length === 0);

  const cmdPaperOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(
    cmdPaperResults.map((result) => ({ ...result, approvedProfileStatus: "paper_watchlist_candidate" }))
  );
  const cmdMonteCarlo = suite.runMonteCarloBatch(cmdPaperOutcomes, {
    source: "real_replay_runner",
    includeApprovedOnly: true,
    includeWatchlist: true,
    simulationCount: 500,
    tradesPerSimulation: Math.min(100, Math.max(1, cmdPaperOutcomes.length)),
    randomSeed: 808,
    researchOnly: true
  });
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(cmdMonteCarlo).ok, true, "CMD Monte Carlo summary must stay compact");

  const paperSignalSample = cmdPaperResults[0]
    ? suite.createPaperSignalFromResearchSignal(researchSignalFromReplayResult(cmdPaperResults[0]), {
        entryPrice: cmdPaperResults[0].tradePath?.entryReference,
        entryType: "manual_reference",
        generatedAt: cmdPaperResults[0].tradePath?.signalTime
      })
    : undefined;

  if (paperSignalSample) {
    assert.equal(paperSignalSample.paperOnly, true);
    assert.equal(paperSignalSample.researchOnly, true);
    assert.equal(paperSignalSample.safety.realOrderPlaced, false);
    assert.equal(paperSignalSample.safety.brokerMutation, false);
    assert.equal(suite.assertIctPaperSignalIsSafe(paperSignalSample).ok, true);
  }

  const cmdPaperMetrics = metricsFor(cmdPaperResults);
  const cmdAllWatchlistMetrics = metricsFor(cmdAllWatchlistResults);
  const strictSupported =
    cmdPaperResults.length >= 20 &&
    cmdPaperMetrics.targetFirstRate >= 0.75 &&
    cmdPaperMetrics.invalidationFirstRate <= 0.15 &&
    cmdMonteCarlo.recommendation.robustnessRating !== "insufficient_data";

  const report = {
    status: "passed",
    diagnostic: "ict_cmd_paper_watchlist_quality_90d",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      htfTimeframes: ["15m", "1h"],
      requestedLookbackDays,
      availableLookbackDays:
        depth.firstTimestamp && depth.lastTimestamp
          ? round((Date.parse(depth.lastTimestamp) - Date.parse(depth.firstTimestamp)) / 86_400_000, 2)
          : 0,
      candleCount: depth.candleCount,
      firstTimestamp: depth.firstTimestamp,
      lastTimestamp: depth.lastTimestamp,
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    counts: {
      totalReplaySignals: pairs.length,
      cmdDetectedModels: cmdResults.filter((result) => result.modelDetected).length,
      cmdResearchCandidates: cmdResearchResults.length,
      cmdApprovedCandidates: cmdApprovedResults.length,
      cmdPaperWatchlistCandidates: cmdPaperResults.length,
      cmdOrdinaryWatchlistCandidates: cmdOrdinaryWatchlistResults.length,
      cmdAllWatchlistCandidates: cmdAllWatchlistResults.length,
      cmdRejectedCandidates: cmdRejectedResults.length,
      cmdNoTradeCandidates: cmdNoTradeResults.length,
      strictEligibleFromCurrentReport: strictEligibleFromCurrentReport.length
    },
    quality: {
      allCmdDetected: metricsFor(cmdResults),
      cmdResearchCandidates: metricsFor(cmdResearchResults),
      cmdApprovedCandidates: metricsFor(cmdApprovedResults),
      cmdAllWatchlistCandidates: cmdAllWatchlistMetrics,
      cmdPaperWatchlistCandidates: cmdPaperMetrics,
      cmdRejectedCandidates: metricsFor(cmdRejectedResults),
      cmdNoTradeCandidates: metricsFor(cmdNoTradeResults)
    },
    strictCmdPaperRules: {
      enabled: true,
      autoApprove: false,
      requirements: [
        "Original status must be watchlist_candidate.",
        "Session profile/model must be consolidation_manipulation_distribution.",
        "Model state must be confirmed.",
        "Side must be long or short and session direction must align with side.",
        "Target, invalidation, and RR must be present.",
        "RR must be at least 1.5R.",
        "First FVG draw target or external liquidity target must exist.",
        "Mitigation or sweep/displacement context must be present.",
        "SMT/session narrative must not contradict the candidate.",
        "Range-bound contexts remain excluded.",
        "Execution remains disabled and paper-only."
      ],
      topIneligibilityReasons: topCounts(cmdAllWatchlistResults, (result) => cmdStrictEligibilityReasons(result)[0] ?? "strict_cmd_eligible", 12)
    },
    priorHighResultVerification: {
      priorClaim: "Earlier broad watchlist run indicated about 59 CMD watchlist candidates and roughly 96.6% target-first.",
      currentReplayBasis: {
        maxReplayWindows,
        lookaheadCandles: 12,
        primaryTimeframe,
        htfTimeframes: ["15m", "1h"]
      },
      currentAllCmdWatchlist: {
        count: cmdAllWatchlistResults.length,
        targetFirstRate: cmdAllWatchlistMetrics.targetFirstRate
      },
      currentStrictCmdPaperWatchlist: {
        count: cmdPaperResults.length,
        targetFirstRate: cmdPaperMetrics.targetFirstRate
      },
      interpretation:
        cmdPaperResults.length && cmdPaperMetrics.targetFirstRate >= 0.75
          ? "High target-first behavior survives strict CMD filtering, but remains paper-watchlist only."
          : "High target-first behavior did not survive strict CMD filtering; keep CMD ordinary watchlist."
    },
    monteCarlo: compactMonteCarlo(cmdMonteCarlo),
    examples: {
      paperWatchlist: compactExamples(cmdPaperResults),
      ordinaryWatchlist: compactExamples(cmdOrdinaryWatchlistResults),
      rejected: compactExamples(cmdRejectedResults)
    },
    recommendation: {
      decision: strictSupported ? "allow_strict_cmd_paper_watchlist_lane" : "keep_cmd_as_ordinary_watchlist_until_more_evidence",
      approvedLane: "unchanged",
      paperWatchlistPromotion: false,
      profileAdjustment:
        strictSupported
          ? "Strict CMD can be paper-simulated, but should not be promoted to approved or readiness without separate gates."
          : "Do not loosen CMD thresholds; collect more evidence or inspect target selection.",
      rangeBoundPolicy: "range_bound remains rejected/no_trade unless a separate reversal or expansion model is confirmed."
    },
    safetyChecks: {
      cmdPaperOnlySimulation: paperSignalSample ? paperSignalSample.paperOnly === true : "no_sample",
      realOrderPlaced: false,
      brokerMutation: false,
      rejectedNoTradeExcludedFromPaperMonteCarlo: cmdPaperOutcomes.every((outcome) => outcome.approvedStatus === "paper_watchlist_candidate"),
      rangeBoundExcluded: !cmdPaperResults.some((result) => result.sessionNarrativeProfile === "range_bound"),
      allCmdPaperHaveTargetInvalidationRr: cmdPaperResults.every((result) => hasTarget(result) && hasInvalidation(result) && hasRr(result)),
      allCmdPaperConfirmed: cmdPaperResults.every((result) => result.modelState === "confirmed"),
      allCmdPaperDirectionAligned: cmdPaperResults.every(sessionConfirmsDirection),
      allCmdPaperResearchOnly: cmdPaperResults.every((result) => result.researchOnly === true)
    },
    safety,
    authority
  };

  assertSafeReport(report);
  assert.equal(report.safetyChecks.realOrderPlaced, false);
  assert.equal(report.safetyChecks.brokerMutation, false);
  assert.equal(report.safetyChecks.rejectedNoTradeExcludedFromPaperMonteCarlo, true);
  assert.equal(report.safetyChecks.rangeBoundExcluded, true);
  assert.equal(report.safetyChecks.allCmdPaperHaveTargetInvalidationRr, true);
  assert.equal(report.safetyChecks.allCmdPaperConfirmed, true);
  assert.equal(report.safetyChecks.allCmdPaperDirectionAligned, true);
  assert.equal(report.safetyChecks.allCmdPaperResearchOnly, true);
  if (cmdPaperResults.length > 0) {
    assert.equal(report.safetyChecks.cmdPaperOnlySimulation, true, "CMD paper-watchlist sample must produce paper-only simulation");
  }
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT CMD paper-watchlist diagnostic failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
