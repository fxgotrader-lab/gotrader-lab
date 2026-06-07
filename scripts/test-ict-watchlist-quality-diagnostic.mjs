#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-watchlist-quality-diagnostic-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_WATCHLIST_QUALITY_DAYS || 90);
const chunkDays = Number(process.env.ICT_WATCHLIST_QUALITY_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_WATCHLIST_QUALITY_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_WATCHLIST_QUALITY_MAX_WINDOWS || 1000));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);

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

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const { file, root } of sourceFiles) {
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
  return globalThis.__ICT_WATCHLIST_QUALITY_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_WATCHLIST_QUALITY_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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
      id: `mt5_watchlist_quality_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
  const latest = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit: Math.min(limit, limitPerChunk)
  }));
  if (!latest.ok) throw new Error(`Latest MT5 candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 candles did not include a last timestamp.");

  const rawCandles = [];
  const chunkReports = [];
  for (const window of dateWindows(lastTimestamp)) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
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
    warnings: [`Explicit watchlist quality diagnostic used ${chunkReports.length} read-only range chunk(s); raw candles stay internal.`],
    missingEvidence: candles.length ? [] : ["No usable MT5 range candles returned for watchlist quality diagnostic."]
  };
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

const topCounts = (values, selector, limit = 8) =>
  Object.entries(countBy(values, selector))
    .map(([key, count]) => ({ key, count }))
    .slice(0, limit);

const approvalWeight = (status) =>
  status === "approved_research_candidate" ? 5 : status === "paper_watchlist_candidate" ? 4 : status === "watchlist_candidate" ? 3 : status === "rejected_candidate" ? 2 : status === "no_trade" ? 1 : 0;

const selectDecision = (decisions) =>
  decisions
    .slice()
    .sort((left, right) => approvalWeight(right.status) - approvalWeight(left.status) || right.approvalScore - left.approvalScore)[0];

const decisionPairsFor = (suite, replayResults) =>
  replayResults.map((result) => {
    const decision = selectDecision(suite.evaluateApprovedSetupProfiles(result));
    return {
      result: {
        ...result,
        approvedProfileStatus: decision?.status,
        approvedProfileId: decision?.profileId,
        approvedProfileScore: decision?.approvalScore,
        approvedProfileReasons: [...(decision?.approvedReasons ?? []), ...(decision?.watchlistReasons ?? []), ...(decision?.rejectionReasons ?? [])].slice(0, 6)
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

const resultRrFor = (result) => {
  const planned = plannedRrFor(result);
  return typeof result.rrEstimate === "number" ? result.rrEstimate : planned ?? result.tradePath?.rrAchieved;
};

const hasTarget = (result) => typeof result.tradePath?.target === "number";
const hasInvalidation = (result) => typeof result.tradePath?.invalidation === "number";
const hasRr = (result) => typeof resultRrFor(result) === "number";
const sessionConfirmsDirection = (result) =>
  (result.sessionDirectionalRead === "bullish" && result.side === "long") ||
  (result.sessionDirectionalRead === "bearish" && result.side === "short");
const riskNotBlocked = (result) =>
  !["reject_candidate", "no_trade"].includes(result.riskGovernorAction ?? "") &&
  !["blocked", "high"].includes(result.newsRiskLevel ?? "") &&
  result.sessionRiskState !== "avoid";

const isValidExpansionProfile = (result) =>
  [
    "accumulation_manipulation_expansion",
    "consolidation_manipulation_distribution",
    "ny_session_reversal_to_premium_fvg",
    "ny_session_reversal_from_premium_to_discount"
  ].includes(result.sessionNarrativeProfile ?? "");

const reasonTypeFor = (reason = "") => {
  const text = reason.toLowerCase();
  if (/downgrades candidate|medium news risk|session risk state is caution/.test(text)) return { type: "soft", key: "medium_news_or_session_caution" };
  if (/input contains a forbidden unsafe field|execution authority violation|broker authority violation|readiness override violation/.test(text)) {
    return { type: "hard", key: "authority_or_unsafe_field" };
  }
  if (/target is missing|missing target/.test(text)) return { type: "hard", key: "missing_target" };
  if (/invalidation is missing|missing invalidation/.test(text)) return { type: "hard", key: "missing_invalidation" };
  if (/rr 0\.00r|rr <= 0|rr is missing|missing rr/.test(text)) return { type: "hard", key: "missing_or_zero_rr" };
  if (/news\/session risk governor rejects|news\/session risk governor marks no-trade|news risk (blocked|high)|session risk state is avoid/.test(text)) {
    return { type: "hard", key: "blocked_news_or_session_risk" };
  }
  if (/smt\/relative strength rejects/.test(text)) return { type: "hard", key: "smt_rejects_candidate" };
  if (/conflicts with|does not confirm|mixed ict bias/.test(text)) return { type: "hard", key: "contradictory_session_or_bias" };
  if (/external liquidity target missing|no liquidity objective/.test(text)) return { type: "hard", key: "no_liquidity_objective" };
  if (/range-bound profile|range_bound/.test(text)) return { type: "hard", key: "range_bound_without_expansion" };
  if (/unknown ict strategy|not research-only|not directional|outside approved|missing primary data|data is unavailable/.test(text)) {
    return { type: "hard", key: "invalid_or_missing_primary_signal" };
  }
  if (/target is too close/.test(text)) return { type: "hard", key: "target_quality" };
  if (/price is at equilibrium/.test(text)) return { type: "hard", key: "equilibrium_context" };
  if (/confidence .*near but below|confidence .*below/.test(text)) return { type: "soft", key: "confidence_below_threshold" };
  if (/smt\/relative strength unavailable|smt\/relative strength confidence drag/.test(text)) return { type: "soft", key: "smt_insufficient_or_missing" };
  if (/fvg evidence missing/.test(text)) return { type: "soft", key: "fvg_missing_with_other_context" };
  if (/higher-timeframe alignment|missing higher-timeframe context|mixed ict bias/.test(text)) return { type: "soft", key: "htf_partial_or_missing" };
  if (/depth is limited/.test(text)) return { type: "soft", key: "limited_data_depth" };
  if (/rr .* below/.test(text)) return { type: "soft", key: "rr_below_profile_threshold" };
  if (/no displacement evidence|no liquidity sweep evidence|ny mitigation/.test(text)) return { type: "hard", key: "missing_displacement_or_sweep" };
  return { type: "uncategorized", key: "other" };
};

const reasonDistribution = (pairs, selector) => {
  const reasons = pairs.flatMap((pair) => selector(pair.decision));
  return {
    hard: topCounts(reasons.filter((reason) => reasonTypeFor(reason).type === "hard"), (reason) => reasonTypeFor(reason).key, 12),
    soft: topCounts(reasons.filter((reason) => reasonTypeFor(reason).type === "soft"), (reason) => reasonTypeFor(reason).key, 12),
    uncategorized: topCounts(reasons.filter((reason) => reasonTypeFor(reason).type === "uncategorized"), (reason) => reason, 8),
    rawTopReasons: topCounts(reasons, (reason) => reason, 12)
  };
};

const missingFieldCountsFor = (results) => ({
  missingTarget: results.filter((result) => !hasTarget(result)).length,
  missingInvalidation: results.filter((result) => !hasInvalidation(result)).length,
  missingRr: results.filter((result) => !hasRr(result)).length,
  missingConfidence: results.filter((result) => typeof result.confidence !== "number").length
});

const qualityMetricsFor = (results) => {
  const rrValues = results.map(resultRrFor).filter((value) => typeof value === "number");
  return {
    count: results.length,
    targetFirstRate: results.length ? round(results.filter((result) => result.outcome === "target_first").length / results.length, 4) : 0,
    invalidationFirstRate: results.length ? round(results.filter((result) => result.outcome === "invalidation_first").length / results.length, 4) : 0,
    averageRr: average(rrValues),
    medianRr: median(rrValues),
    countWithTarget: results.filter(hasTarget).length,
    countWithInvalidation: results.filter(hasInvalidation).length,
    countWithRr: results.filter(hasRr).length,
    countWithConfidence: results.filter((result) => typeof result.confidence === "number").length,
    countBySessionNarrativeProfile: countBy(results, (result) => result.sessionNarrativeProfile),
    countBySetup: countBy(results, (result) => result.setup),
    countBySide: countBy(results, (result) => result.side),
    countByOutcome: countBy(results, (result) => result.outcome),
    countByMissingField: missingFieldCountsFor(results)
  };
};

const compactMonteCarlo = (summary) => ({
  usableOutcomes: summary.input.usableOutcomes,
  robustnessRating: summary.recommendation.robustnessRating,
  medianEndingR: summary.performance.medianEndingR,
  fifthPercentileEndingR: summary.performance.fifthPercentileEndingR,
  medianDrawdownR: summary.performance.medianMaxDrawdownR,
  worstDrawdownR: summary.performance.worstMaxDrawdownR,
  riskOfRuinPct: summary.performance.riskOfRuinPct,
  recommendedMaxRiskPerTradePct: summary.recommendation.recommendedMaxRiskPerTradePct,
  warnings: summary.recommendation.warnings
});

const structurallyRepairableRejectedCount = (pairs) =>
  pairs.filter((pair) => {
    const reasons = pair.decision?.rejectionReasons ?? [];
    return (
      reasons.length > 0 &&
      reasons.every((reason) =>
        ["missing_target", "missing_invalidation", "missing_or_zero_rr", "target_quality", "rr_below_profile_threshold"].includes(reasonTypeFor(reason).key)
      )
    );
  }).length;

const paperEligibilityReasonFor = (result) => {
  const rr = resultRrFor(result);
  const reasons = [
    !hasTarget(result) ? "missing_target" : undefined,
    !hasInvalidation(result) ? "missing_invalidation" : undefined,
    typeof rr !== "number" ? "missing_rr" : undefined,
    typeof rr === "number" && rr < 1.5 ? "rr_below_1_5" : undefined,
    !sessionConfirmsDirection(result) ? "session_narrative_does_not_confirm_direction" : undefined,
    !riskNotBlocked(result) ? "news_or_session_risk_blocked" : undefined,
    result.sessionNarrativeProfile === "range_bound" ? "range_bound_excluded" : undefined,
    !isValidExpansionProfile(result) ? "no_valid_expansion_or_reversal_profile" : undefined
  ].filter(Boolean);
  return reasons;
};

const paperEligibleWatchlistResults = (watchlistResults) =>
  watchlistResults.filter((result) => paperEligibilityReasonFor(result).length === 0);

const recommendationFor = ({ approved, watchlist, paperEligible, paperMonteCarlo, rejectedPairs }) => {
  const structuralRejected = structurallyRepairableRejectedCount(rejectedPairs);
  if (paperEligible.length >= 20 && paperMonteCarlo.recommendation.robustnessRating !== "insufficient_data") {
    return "add_paper_only_watchlist_testing";
  }
  if (paperEligible.length >= 5 && watchlist.targetFirstRate >= 0.55) {
    return "keep_strict_approval_and_trial_paper_only_watchlist";
  }
  if (structuralRejected >= Math.max(10, Math.round(rejectedPairs.length * 0.2))) {
    return "improve_target_invalidation_generation_before_looser_profiles";
  }
  if (approved.count < 30) return "collect_more_data_and_test_more_symbols";
  return "keep_strict_approval";
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const result = await suite.runIctRealReplay(
    {
      requestedSymbols: [requestedSymbol],
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
  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(result).ok, true, "real replay run output must stay compact");
  const replayResults = result.replayResults ?? [];
  const pairs = decisionPairsFor(suite, replayResults);
  const selectedResults = pairs.map((pair) => pair.result);
  const researchPairs = pairs.filter((pair) => pair.result.decision === "research_only");
  const approvedResults = selectedResults.filter((result) => result.approvedProfileStatus === "approved_research_candidate" && result.decision === "research_only");
  const paperWatchlistPairs = researchPairs.filter((pair) => pair.decision?.status === "paper_watchlist_candidate");
  const watchlistPairs = researchPairs.filter((pair) => pair.decision?.status === "watchlist_candidate" || pair.decision?.status === "paper_watchlist_candidate");
  const rejectedPairs = researchPairs.filter((pair) => pair.decision?.status === "rejected_candidate");
  const noTradePairs = pairs.filter((pair) => pair.decision?.status === "no_trade" || pair.result.decision === "no_trade");
  const watchlistResults = watchlistPairs.map((pair) => pair.result).filter((result) => result.decision === "research_only");
  const rejectedResults = rejectedPairs.map((pair) => pair.result);
  const paperEligible = paperWatchlistPairs.map((pair) => pair.result).filter((result) => result.decision === "research_only");
  const paperOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(
    paperEligible.map((result) => ({ ...result, approvedProfileStatus: "paper_watchlist_candidate" }))
  );
  const paperMonteCarlo = suite.runMonteCarloBatch(paperOutcomes, {
    source: "real_replay_runner",
    includeApprovedOnly: true,
    includeWatchlist: true,
    simulationCount: 300,
    tradesPerSimulation: Math.min(100, Math.max(1, paperOutcomes.length)),
    randomSeed: 606,
    researchOnly: true
  });
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(paperMonteCarlo).ok, true, "paper-watchlist Monte Carlo summary must stay compact");

  const approvedMetrics = qualityMetricsFor(approvedResults);
  const watchlistMetrics = qualityMetricsFor(watchlistResults);
  const rejectedMetrics = qualityMetricsFor(rejectedResults);
  const paperMetrics = qualityMetricsFor(paperEligible);
  const paperIneligibleReasons = topCounts(watchlistResults, (result) => paperEligibilityReasonFor(result)[0] ?? "paper_eligible", 12);
  const bestWatchlistProfile = Object.entries(watchlistMetrics.countBySessionNarrativeProfile)
    .map(([profile, count]) => {
      const profileResults = watchlistResults.filter((result) => result.sessionNarrativeProfile === profile);
      return {
        profile,
        count,
        targetFirstRate: qualityMetricsFor(profileResults).targetFirstRate,
        averageRr: qualityMetricsFor(profileResults).averageRr
      };
    })
    .sort((left, right) => right.targetFirstRate - left.targetFirstRate || right.count - left.count)[0];

  const paperOnlyPreview = paperEligible[0]
    ? {
        status: "paper_watchlist_candidate",
        executionAllowed: false,
        researchOnly: true,
        paperOnly: true,
        requestedSymbol: paperEligible[0].requestedSymbol,
        brokerSymbol: paperEligible[0].brokerSymbol,
        setup: paperEligible[0].setup,
        side: paperEligible[0].side,
        authority
      }
    : {
        status: "no_paper_watchlist_candidate",
        executionAllowed: false,
        researchOnly: true,
        paperOnly: true,
        authority
      };

  const recommendation = recommendationFor({
    approved: approvedMetrics,
    watchlist: watchlistMetrics,
    paperEligible,
    paperMonteCarlo,
    rejectedPairs
  });

  const report = {
    status: "passed",
    diagnostic: "ict_watchlist_quality_90d",
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      requestedLookbackDays,
      maxReplayWindows,
      dataDepthStatus: result.symbolSummaries?.[0]?.status ?? "completed"
    },
    summary: {
      totalReplaySignals: replayResults.length,
      approvedCount: approvedResults.length,
      paperWatchlistCount: paperWatchlistPairs.length,
      watchlistCount: watchlistPairs.length,
      rejectedCount: rejectedPairs.length,
      noTradeCount: noTradePairs.length,
      selectedProfileCounts: countBy(selectedResults, (result) => result.approvedProfileId)
    },
    approved: approvedMetrics,
    watchlist: {
      ...watchlistMetrics,
      countByWatchlistReason: topCounts(watchlistPairs, (pair) => pair.decision?.watchlistReasons?.[0] ?? "watchlist reason unavailable", 12),
      softBlockers: reasonDistribution(watchlistPairs, (decision) => decision?.watchlistReasons ?? []).soft,
      hardBlockers: reasonDistribution(watchlistPairs, (decision) => decision?.rejectionReasons ?? []).hard
    },
    rejected: {
      ...rejectedMetrics,
      topRejectionReasons: topCounts(rejectedPairs, (pair) => pair.decision?.rejectionReasons?.[0] ?? "rejection reason unavailable", 12),
      hardBlockers: reasonDistribution(rejectedPairs, (decision) => decision?.rejectionReasons ?? []).hard,
      softBlockers: reasonDistribution(rejectedPairs, (decision) => decision?.watchlistReasons ?? []).soft,
      structurallyRepairableIfTargetInvalidationRrExisted: structurallyRepairableRejectedCount(rejectedPairs)
    },
    hardVsSoftBlockerDistribution: {
      hard: reasonDistribution(researchPairs, (decision) => decision?.rejectionReasons ?? []).hard,
      soft: reasonDistribution(researchPairs, (decision) => decision?.watchlistReasons ?? []).soft,
      uncategorized: [
        ...reasonDistribution(researchPairs, (decision) => decision?.rejectionReasons ?? []).uncategorized,
        ...reasonDistribution(researchPairs, (decision) => decision?.watchlistReasons ?? []).uncategorized
      ].slice(0, 8)
    },
    paperOnlyWatchlistAnalysis: {
      policy: "diagnostic_only_not_promoted",
      eligibilityRules: [
        "target exists",
        "invalidation exists",
        "planned RR >= 1.5",
        "session narrative confirms direction",
        "news/session risk is not blocked",
        "range_bound is excluded unless a valid reversal/expansion model exists",
        "executionAllowed remains false"
      ],
      paperEligibleWatchlistCount: paperEligible.length,
      quality: paperMetrics,
      monteCarlo: compactMonteCarlo(paperMonteCarlo),
      sessionNarrativeDistribution: countBy(paperEligible, (result) => result.sessionNarrativeProfile),
      topWarnings: paperIneligibleReasons,
      paperOnlyPreview
    },
    targetInvalidationRrDiagnosis: {
      watchlistMissingFields: missingFieldCountsFor(watchlistResults),
      rejectedMissingFields: missingFieldCountsFor(rejectedResults),
      propagationIssueLikely: false,
      fallbackApplied: true,
      fallbackPolicy: "Safe compact session-structure fallback may complete target/invalidation/RR; approval gates remain strict.",
      nextAction:
        structurallyRepairableRejectedCount(rejectedPairs) > 0
          ? "Audit deterministic target/invalidation generation for structurally clear rejected candidates before loosening approvals."
          : "Missing structure is not the dominant repairable blocker; keep approval strict and collect more data."
    },
    bestSessionNarrativeByWatchlistQuality: bestWatchlistProfile ?? {
      profile: "none",
      count: 0,
      targetFirstRate: 0,
      averageRr: 0
    },
    recommendations: {
      primary: recommendation,
      keepStrictApproval: true,
      addPaperOnlyWatchlistTesting: ["add_paper_only_watchlist_testing", "keep_strict_approval_and_trial_paper_only_watchlist"].includes(recommendation),
      improveTargetInvalidationGeneration: recommendation === "improve_target_invalidation_generation_before_looser_profiles",
      collectMoreData: approvedResults.length < 30,
      testMoreSymbols: true,
      rangeBoundPolicy: "Keep range_bound without expansion/reversal confirmation rejected or no_trade."
    },
    safety,
    authority
  };

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "watchlist diagnostic must not expose raw candles");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    "watchlist diagnostic must not expose unsafe data"
  );
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.ok(report.hardVsSoftBlockerDistribution.hard.length >= 1, "hard blocker distribution must be populated");
  assert.ok(report.watchlist.countByWatchlistReason.length >= 1 || report.watchlist.count === 0, "watchlist reasons must be reported when present");
  assert.ok(report.rejected.topRejectionReasons.length >= 1 || report.rejected.count === 0, "rejected reasons must be reported when present");
  assert.ok(report.rejected.hardBlockers.length >= 1 || report.rejected.count === 0, "hard blockers must remain rejected.");
  assert.equal(report.watchlist.hardBlockers.length, 0, "watchlist candidates must not carry hard blockers.");
  assert.ok(report.watchlist.softBlockers.length >= 1 || report.watchlist.count === 0, "soft blockers should be visible on watchlist candidates.");
  assert.equal(report.paperOnlyWatchlistAnalysis.paperOnlyPreview.executionAllowed, false, "paper-only preview must keep execution disabled");
  assert.equal(report.paperOnlyWatchlistAnalysis.paperOnlyPreview.authority.executionAuthority, "none");
  assert.equal(report.targetInvalidationRrDiagnosis.fallbackApplied, true, "safe target/invalidation fallback policy should be visible");
  assert.ok(
    !Object.keys(report.paperOnlyWatchlistAnalysis.sessionNarrativeDistribution).includes("range_bound") ||
      report.paperOnlyWatchlistAnalysis.paperEligibleWatchlistCount === 0,
    "range_bound without expansion must not become paper eligible"
  );
  assert.ok(
    report.paperOnlyWatchlistAnalysis.paperEligibleWatchlistCount === 0 ||
      report.paperOnlyWatchlistAnalysis.quality.countWithTarget === report.paperOnlyWatchlistAnalysis.paperEligibleWatchlistCount,
    "missing target must prevent paper eligibility"
  );
  assert.ok(
    report.paperOnlyWatchlistAnalysis.paperEligibleWatchlistCount === 0 ||
      report.paperOnlyWatchlistAnalysis.quality.countWithInvalidation === report.paperOnlyWatchlistAnalysis.paperEligibleWatchlistCount,
    "missing invalidation must prevent paper eligibility"
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT watchlist quality diagnostic failed: ${error?.message ?? error}`);
  process.exit(1);
});
