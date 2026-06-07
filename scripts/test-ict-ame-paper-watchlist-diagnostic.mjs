#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-ame-paper-watchlist-diagnostic-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_AME_WATCHLIST_DAYS || 90);
const chunkDays = Number(process.env.ICT_AME_WATCHLIST_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_AME_WATCHLIST_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_AME_WATCHLIST_MAX_WINDOWS || 240));
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
  "ictSignalContractTypes.ts",
  "ictSignalContract.ts",
  "ictPaperSignalSimulatorTypes.ts",
  "ictPaperSignalSimulator.ts",
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
  return globalThis.__ICT_AME_WATCHLIST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_AME_WATCHLIST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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
      id: `mt5_ame_watchlist_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
  sourceId: `ict_ame_watchlist:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
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
    sourceLabel: "MT5 read-only CFD/proxy AME paper-watchlist diagnostic source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_ame_watchlist|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
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
const riskFor = (result) => {
  const entry = result.tradePath?.entryReference;
  const invalidation = result.tradePath?.invalidation;
  return [entry, invalidation].every(Number.isFinite) ? Math.abs(entry - invalidation) : undefined;
};
const targetDistanceFor = (result) => {
  const entry = result.tradePath?.entryReference;
  const target = result.tradePath?.target;
  return [entry, target].every(Number.isFinite) ? Math.abs(target - entry) : undefined;
};
const invalidationDistanceFor = riskFor;
const mfeRFor = (result) => {
  const risk = riskFor(result);
  return risk && risk > 0 && Number.isFinite(result.tradePath?.maxFavorableExcursion)
    ? round(result.tradePath.maxFavorableExcursion / risk, 4)
    : undefined;
};
const maeRFor = (result) => {
  const risk = riskFor(result);
  return risk && risk > 0 && Number.isFinite(result.tradePath?.maxAdverseExcursion)
    ? round(result.tradePath.maxAdverseExcursion / risk, 4)
    : undefined;
};

const tradingDateFor = (result) => {
  const value = result.tradePath?.signalTime ?? result.generatedAt ?? result.timestamp;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "unknown";
};

const fvgTargetAlignsSide = (result) =>
  (result.side === "long" && result.fvgTargetDetected === true && result.fvgTargetDirection === "premium") ||
  (result.side === "short" && result.fvgTargetDetected === true && result.fvgTargetDirection === "discount");

const directionConfirmsSide = (result) =>
  (result.sessionDirectionalRead === "bullish" && result.side === "long") ||
  (result.sessionDirectionalRead === "bearish" && result.side === "short");

const directionContradictsSide = (result) =>
  (result.sessionDirectionalRead === "bullish" && result.side === "short") ||
  (result.sessionDirectionalRead === "bearish" && result.side === "long");

const riskNotBlocked = (result) =>
  !["reject_candidate", "no_trade"].includes(result.riskGovernorAction ?? "") &&
  !["blocked", "high"].includes(result.newsRiskLevel ?? "") &&
  result.sessionRiskState !== "avoid";

const legacyBroadPaperEligible = ({ result, decision }) =>
  result.decision === "research_only" &&
  result.sessionNarrativeProfile === "accumulation_manipulation_expansion" &&
  ["watchlist_candidate", "paper_watchlist_candidate"].includes(decision?.status ?? "") &&
  typeof result.tradePath?.target === "number" &&
  typeof result.tradePath?.invalidation === "number" &&
  typeof resultRrFor(result) === "number" &&
  typeof result.confidence === "number" &&
  result.researchOnly === true &&
  !directionContradictsSide(result) &&
  riskNotBlocked(result);

const failureCauseFor = (result) => {
  const rr = resultRrFor(result);
  const mfeR = mfeRFor(result) ?? 0;
  if (directionContradictsSide(result) || !directionConfirmsSide(result)) return "direction_mismatch";
  if (result.sessionNarrativeProfile === "range_bound") return "range_bound_context";
  if (result.sessionNarrativeProfile !== "accumulation_manipulation_expansion") return "session_profile_not_specific_enough";
  if (result.modelState === "forming" || result.modelState === "triggered") return "entry_too_early";
  if (result.modelState !== "confirmed") return "model_not_confirmed";
  if (!fvgTargetAlignsSide(result)) return "wrong_target_type";
  if (typeof rr === "number" && rr > 2.25) return "target_too_far";
  if (typeof rr === "number" && rr < 1.25) return "target_too_close";
  if (result.riskGovernorAction === "downgrade_to_watchlist") return "session_profile_not_specific_enough";
  if (result.sessionMitigationDetected !== true) return "session_profile_not_specific_enough";
  if (result.outcome === "insufficient_future_candles") return "insufficient_future_candles";
  if (result.outcome === "invalidation_first" && mfeR < 0.5) return "invalidation_too_close";
  if ((result.outcome === "partial_target" || result.outcome === "stalled") && mfeR >= 1 && typeof rr === "number" && rr > mfeR) return "target_too_far";
  if (result.outcome === "stalled" && mfeR < 0.5) return "entry_after_move_completed";
  return "unknown";
};

const metricsFor = (results) => {
  const rrValues = results.map(resultRrFor).filter((value) => typeof value === "number");
  const confidenceValues = results.map((result) => result.confidence).filter((value) => typeof value === "number");
  const targetDistances = results.map(targetDistanceFor).filter((value) => typeof value === "number");
  const invalidationDistances = results.map(invalidationDistanceFor).filter((value) => typeof value === "number");
  const mfeRValues = results.map(mfeRFor).filter((value) => typeof value === "number");
  const maeRValues = results.map(maeRFor).filter((value) => typeof value === "number");
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
    averageMfeR: average(mfeRValues),
    averageMaeR: average(maeRValues),
    reachedHalfR: results.filter((result) => (mfeRFor(result) ?? 0) >= 0.5).length,
    reachedOneR: results.filter((result) => (mfeRFor(result) ?? 0) >= 1).length,
    reachedTwoR: results.filter((result) => (mfeRFor(result) ?? 0) >= 2).length,
    countByDate: countBy(results, tradingDateFor),
    countBySide: countBy(results, (result) => result.side),
    countByModelState: countBy(results, (result) => result.modelState ?? "unknown"),
    countByFvgTargetDirection: countBy(results, (result) => result.fvgTargetDirection ?? "unknown"),
    countByOutcome: countBy(results, (result) => result.outcome),
    countByFailureCause: countBy(results, failureCauseFor)
  };
};

const compactExamples = (results, limit = 8) =>
  results.slice(0, limit).map((result) => ({
    signalTime: result.tradePath?.signalTime,
    side: result.side,
    modelState: result.modelState ?? "unknown",
    outcome: result.outcome,
    plannedRr: resultRrFor(result),
    mfeR: mfeRFor(result),
    maeR: maeRFor(result),
    failureCause: failureCauseFor(result),
    decisionReason: result.approvedProfileReasons?.[0] ?? result.noTradeReasons?.[0] ?? "reason unavailable"
  }));

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
  globalThis.__ICT_AME_WATCHLIST_SOURCES = new Map([[source.sourceId, source]]);

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
        warnings: ["AME paper-watchlist diagnostic used explicit read-only MT5 range chunks; raw candles stayed internal."],
        missingEvidence: depth.candles.length ? [] : ["No MT5 candles were available."]
      }),
      newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_replay" }
    }
  );

  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(replay).ok, true, "real replay output must stay compact");
  const pairs = decisionPairsFor(suite, replay.replayResults ?? []);
  const researchPairs = pairs.filter((pair) => pair.result.decision === "research_only");
  const amePairs = researchPairs.filter((pair) => pair.result.sessionNarrativeProfile === "accumulation_manipulation_expansion");
  const legacyAmePairs = researchPairs.filter(legacyBroadPaperEligible);
  const tightenedAmePairs = amePairs.filter((pair) => pair.decision?.status === "paper_watchlist_candidate");
  const legacyKeys = new Set(legacyAmePairs.map((pair) => `${pair.result.tradePath?.signalTime}|${pair.result.side}|${pair.result.setup}`));
  const tightenedKeys = new Set(tightenedAmePairs.map((pair) => `${pair.result.tradePath?.signalTime}|${pair.result.side}|${pair.result.setup}`));
  const demotedPairs = legacyAmePairs.filter((pair) => !tightenedKeys.has(`${pair.result.tradePath?.signalTime}|${pair.result.side}|${pair.result.setup}`));
  const legacyResults = legacyAmePairs.map((pair) => pair.result);
  const tightenedResults = tightenedAmePairs.map((pair) => pair.result);
  const demotedResults = demotedPairs.map((pair) => pair.result);

  const report = {
    status: "passed",
    diagnostic: "ict_ame_paper_watchlist_quality",
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
    policy: {
      oldPolicy: "Broad paper-watchlist admitted complete target/invalidation/RR near-misses with no AME-specific first-target quality gate.",
      tightenedPolicy: [
        "AME must be ordinary watchlist first; approval remains unchanged.",
        "AME modelState must be confirmed.",
        "Session direction must confirm side.",
        "NY mitigation, displacement, liquidity sweep, and aligned FVG draw target must be present.",
        "News/session risk downgrades remain ordinary watchlist.",
        "Planned first-target RR must be between 1.25R and 2.25R.",
        "No broker, readiness, or execution authority is introduced."
      ],
      oldAmePaperWatchlistCount: legacyAmePairs.length,
      tightenedAmePaperWatchlistCount: tightenedAmePairs.length,
      demotedFromPaperToOrdinaryWatchlist: demotedPairs.length
    },
    totals: {
      replaySignals: pairs.length,
      researchCandidates: researchPairs.length,
      ameResearchCandidates: amePairs.length,
      ameLegacyKeyCount: legacyKeys.size,
      ameTightenedKeyCount: tightenedKeys.size
    },
    oldPolicyAmeQuality: metricsFor(legacyResults),
    tightenedAmeQuality: metricsFor(tightenedResults),
    demotedAmeDiagnostics: {
      quality: metricsFor(demotedResults),
      failureCauseCounts: countBy(demotedResults, failureCauseFor),
      topDecisionReasons: topCounts(demotedPairs, (pair) => pair.decision?.watchlistReasons?.[0] ?? pair.decision?.rejectionReasons?.[0] ?? "reason unavailable"),
      examples: compactExamples(demotedResults)
    },
    recommendation: {
      amePaperWatchlist: tightenedAmePairs.length
        ? "keep_only_tightened_ame_first_target_candidates_in_paper_watchlist"
        : "keep_ame_as_ordinary_watchlist_until_first_target_evidence_improves",
      approvedLane: "unchanged",
      paperWatchlistPromotion: false,
      nextWork:
        demotedPairs.length > 0
          ? "Review AME target selection toward first FVG/near liquidity before any further profile loosening."
          : "Collect more AME candidates across additional dates before changing profile thresholds."
    },
    safetyChecks: {
      rawCandlesExcluded: true,
      oldPolicyHadNoExecutionAuthority: true,
      tightenedPolicyHasNoExecutionAuthority: true,
      paperWatchlistNotPromotedToApproved: tightenedAmePairs.every((pair) => pair.decision?.status === "paper_watchlist_candidate"),
      demotedCandidatesRemainResearchOnly: demotedPairs.every((pair) => pair.result.researchOnly === true)
    },
    safety,
    authority
  };

  assertSafeReport(report);
  assert.ok(report.policy.tightenedAmePaperWatchlistCount <= report.policy.oldAmePaperWatchlistCount, "tightened AME lane must not admit more candidates than the old broad lane");
  assert.equal(report.safetyChecks.paperWatchlistNotPromotedToApproved, true);
  assert.equal(report.safetyChecks.demotedCandidatesRemainResearchOnly, true);
  assert.ok(tightenedResults.every((result) => result.modelState === "confirmed"), "tightened AME paper candidates must have confirmed model state");
  assert.ok(tightenedResults.every(fvgTargetAlignsSide), "tightened AME paper candidates must have aligned FVG draw target");
  assert.ok(tightenedResults.every((result) => {
    const rr = resultRrFor(result);
    return typeof rr === "number" && rr >= 1.25 && rr <= 2.25;
  }), "tightened AME paper candidates must use first-target RR bounds");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT AME paper-watchlist diagnostic failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
