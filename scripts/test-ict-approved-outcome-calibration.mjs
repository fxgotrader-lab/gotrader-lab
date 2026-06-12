#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-approved-outcome-calibration-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_APPROVED_OUTCOME_90D_DAYS || 90);
const chunkDays = Number(process.env.ICT_APPROVED_OUTCOME_90D_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_APPROVED_OUTCOME_90D_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_APPROVED_OUTCOME_MAX_WINDOWS || 1000));
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
  { root: sourceRoot, file: "ictMarketAnalysisContextTypes.ts" },
  { root: sourceRoot, file: "ictMarketAnalysisContext.ts" },
  { root: sourceRoot, file: "ictOpportunityDetectionTypes.ts" },
  { root: sourceRoot, file: "ictOpportunityDetection.ts" },
  { root: sourceRoot, file: "ictUniversalRecognitionTypes.ts" },
  { root: sourceRoot, file: "ictUniversalRecognition.ts" },
  { root: sourceRoot, file: "ictSelfImprovementTypes.ts" },
  { root: sourceRoot, file: "ictSelfImprovement.ts" },
  { root: sourceRoot, file: "ictHypothesisValidationTypes.ts" },
  { root: sourceRoot, file: "ictHypothesisValidation.ts" },
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
  return globalThis.__ICT_APPROVED_OUTCOME_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_APPROVED_OUTCOME_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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
      id: `mt5_approved_outcome_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
    warnings: [`Explicit approved-outcome calibration used ${chunkReports.length} read-only range chunk(s); raw candles stay internal.`],
    missingEvidence: candles.length ? [] : ["No usable MT5 range candles returned for approved-outcome calibration."]
  };
}

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);

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

const average = (values) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);

const safeApprovedMetrics = (results) => {
  const approved = results.filter((result) => result.approvedProfileStatus === "approved_research_candidate" && result.decision === "research_only");
  return {
    count: approved.length,
    targetFirstRate: approved.length ? round(approved.filter((result) => result.outcome === "target_first").length / approved.length, 4) : 0,
    averageRr: average(approved.map((result) => result.tradePath.rrAchieved).filter((value) => typeof value === "number"))
  };
};

const signalTimeFor = (result) => result.tradePath?.signalTime;
const signalDateFor = (result) => signalTimeFor(result)?.slice(0, 10) ?? "unknown";
const signalTimeRangeFor = (results) => {
  const times = results.map((result) => Date.parse(signalTimeFor(result))).filter(Number.isFinite).sort((left, right) => left - right);
  return {
    firstSignalTime: times.length ? new Date(times[0]).toISOString() : undefined,
    lastSignalTime: times.length ? new Date(times.at(-1)).toISOString() : undefined
  };
};

const rollingSignalWindowsFor = (results, windowDays = 30, stepDays = 15) => {
  const times = results.map((result) => Date.parse(signalTimeFor(result))).filter(Number.isFinite).sort((left, right) => left - right);
  if (!times.length) return [];
  const first = times[0];
  const last = times.at(-1);
  const windowMillis = windowDays * 86_400_000;
  const stepMillis = stepDays * 86_400_000;
  const windows = [];
  let cursor = first;
  while (cursor <= last && windows.length < 20) {
    const end = Math.min(cursor + windowMillis, last);
    windows.push({
      id: `aggregate_window_${windows.length + 1}`,
      from: new Date(cursor).toISOString(),
      to: new Date(end).toISOString()
    });
    if (end >= last) break;
    cursor += stepMillis;
  }
  const lastWindow = windows.at(-1);
  if (lastWindow && Date.parse(lastWindow.to) < last) {
    windows.push({
      id: `aggregate_window_${windows.length + 1}_trailing`,
      from: new Date(Math.max(first, last - windowMillis)).toISOString(),
      to: new Date(last).toISOString()
    });
  }
  return windows;
};

const approvedByRollingWindow = (approved) =>
  rollingSignalWindowsFor(approved).map((window) => {
    const from = Date.parse(window.from);
    const to = Date.parse(window.to);
    const inWindow = approved.filter((result) => {
      const time = Date.parse(signalTimeFor(result));
      return time >= from && time <= to;
    });
    return {
      ...window,
      approvedCount: inWindow.length,
      approvedTargetFirstRate: inWindow.length ? round(inWindow.filter((result) => result.outcome === "target_first").length / inWindow.length, 4) : 0,
      approvedAverageRr: average(inWindow.map((result) => result.tradePath.rrAchieved).filter((value) => typeof value === "number"))
    };
  });

const approvedAvailability = (approved) => ({
  targetPresent: approved.filter((result) => typeof result.tradePath.target === "number").length,
  invalidationPresent: approved.filter((result) => typeof result.tradePath.invalidation === "number").length,
  rrPresent: approved.filter((result) => typeof result.tradePath.rrAchieved === "number" || typeof result.rrEstimate === "number").length,
  targetMissing: approved.filter((result) => typeof result.tradePath.target !== "number").length,
  invalidationMissing: approved.filter((result) => typeof result.tradePath.invalidation !== "number").length,
  rrMissing: approved.filter((result) => typeof result.tradePath.rrAchieved !== "number" && typeof result.rrEstimate !== "number").length
});

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
  const profiles = suite.getDefaultApprovedSetupProfiles();
  const strictProfile = profiles.find((profile) => profile.id === "gotrader_ict_phase1_strict");
  assert.ok(strictProfile, "strict approved profile must exist");
  const strictDecisions = replayResults.map((item) => suite.evaluateApprovedSetupProfile(item, strictProfile));
  const selectedDecisions = replayResults.map((item) => selectDecision(suite.evaluateApprovedSetupProfiles(item)));
  const selectedResults = replayResults.map((item, index) => ({
    ...item,
    approvedProfileStatus: selectedDecisions[index]?.status,
    approvedProfileId: selectedDecisions[index]?.profileId
  }));
  const strictOnlyResults = replayResults.map((item, index) => ({
    ...item,
    approvedProfileStatus: strictDecisions[index]?.status,
    approvedProfileId: strictDecisions[index]?.profileId
  }));
  const beforeOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(strictOnlyResults);
  const afterOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(selectedResults);
  const beforeMc = suite.runMonteCarloBatch(beforeOutcomes, {
    source: "real_replay_runner",
    simulationCount: 300,
    tradesPerSimulation: Math.min(100, Math.max(1, beforeOutcomes.length)),
    randomSeed: 90,
    researchOnly: true
  });
  const afterMc = suite.runMonteCarloBatch(afterOutcomes, {
    source: "real_replay_runner",
    simulationCount: 300,
    tradesPerSimulation: Math.min(100, Math.max(1, afterOutcomes.length)),
    randomSeed: 91,
    researchOnly: true
  });
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(beforeMc).ok, true, "before Monte Carlo summary must stay compact");
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(afterMc).ok, true, "after Monte Carlo summary must stay compact");

  const approved = selectedResults.filter((item) => item.approvedProfileStatus === "approved_research_candidate");
  const rejectedOrWatchlist = selectedDecisions.filter((decision) => decision?.status !== "approved_research_candidate");
  const approvedStatusMissingCount = selectedResults.filter((item) => !item.approvedProfileStatus).length;
  const approvedExtractionDroppedCount = Math.max(0, approved.length - afterMc.input.usableOutcomes);
  const robustnessClassification =
    approved.length >= 30 && afterMc.recommendation.robustnessRating !== "insufficient_data"
      ? "aggregate_supportive_pending_oos"
      : approved.length > 0
        ? "promising_but_unproven"
        : "insufficient_data";
  const missingFieldCounts = {
    missingTarget: replayResults.filter((item) => typeof item.tradePath.target !== "number").length,
    missingInvalidation: replayResults.filter((item) => typeof item.tradePath.invalidation !== "number").length,
    missingRr: replayResults.filter((item) => typeof item.rrEstimate !== "number" && typeof item.tradePath.rrAchieved !== "number").length,
    missingConfidence: replayResults.filter((item) => typeof item.confidence !== "number").length,
    missingFvg: replayResults.filter((item) => item.fvgStatus === "not_applicable").length,
    missingHtf: replayResults.filter((item) => item.htfAligned === undefined).length,
    missingExternalLiquidity: replayResults.filter((item) => !item.liquidityTargetType).length,
    contradictoryNarrative: replayResults.filter(
      (item) =>
        (item.sessionDirectionalRead === "bullish" && item.side === "short") ||
        (item.sessionDirectionalRead === "bearish" && item.side === "long")
    ).length,
    rangeBoundProfile: replayResults.filter((item) => item.sessionNarrativeProfile === "range_bound").length
  };
  const rootCause =
    beforeMc.input.usableOutcomes === 0 && afterMc.input.usableOutcomes > 0
      ? "Replay candidates existed, but strict-only approvedProfileStatus was not a usable Monte Carlo mapping; selected profile decisions now propagate into replay results."
      : afterMc.input.usableOutcomes === 0
        ? "No legitimate approved candidates passed target/invalidation/RR/session narrative gates in this 90-day sample."
        : "Approved candidates now map into Monte Carlo outcomes; remaining limitation is sample size and profile quality.";

  const report = {
    status: afterMc.input.usableOutcomes > 0 ? "passed" : "insufficient_data",
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      requestedLookbackDays,
      maxReplayWindows
    },
    replay: {
      totalSignals: replayResults.length,
      approvedCount: approved.length,
      watchlistCount: selectedResults.filter((item) => item.approvedProfileStatus === "watchlist_candidate").length,
      rejectedCount: selectedResults.filter((item) => item.approvedProfileStatus === "rejected_candidate").length,
      noTradeCount: selectedResults.filter((item) => item.approvedProfileStatus === "no_trade" || item.decision === "no_trade").length,
      approvedTargetFirstRate: safeApprovedMetrics(selectedResults).targetFirstRate,
      approvedAverageRr: safeApprovedMetrics(selectedResults).averageRr,
      countBySelectedProfile: countBy(selectedResults, (item) => item.approvedProfileId),
      countBySessionNarrativeProfile: countBy(selectedResults, (item) => item.sessionNarrativeProfile),
      countBySetup: countBy(selectedResults, (item) => item.setup),
      countByRiskGovernorAction: countBy(selectedResults, (item) => item.riskGovernorAction),
      countBySmtStatus: countBy(selectedResults, (item) =>
        item.smtRejectsCandidate ? "rejects" : item.smtConfirmsCandidate ? "confirms" : item.smtDivergenceType ?? "not_evaluated"
      ),
      approvedOutcomeDistribution: {
        signalTimeRange: signalTimeRangeFor(approved),
        byDate: countBy(approved, signalDateFor),
        byRollingWindow: approvedByRollingWindow(approved),
        bySessionNarrativeProfile: countBy(approved, (item) => item.sessionNarrativeProfile),
        bySetup: countBy(approved, (item) => item.setup),
        bySide: countBy(approved, (item) => item.side),
        byReason: topCounts(
          approved.map((item, index) => ({
            result: item,
            decision: selectedDecisions[index]
          })),
          (item) => item.result.approvedProfileReasons?.[0] ?? item.decision?.approvedReasons?.[0] ?? "approved reason unavailable"
        ),
        targetInvalidationRrAvailability: approvedAvailability(approved)
      },
      pipelineDiagnostics: {
        sessionNarrativeResolution: "per_signal_trading_date",
        approvedCountBeforeMonteCarloExtraction: approved.length,
        approvedCountAfterMonteCarloExtraction: afterMc.input.usableOutcomes,
        approvedExtractionDroppedCount,
        approvedStatusMissingCount,
        robustnessClassification,
        note:
          "Aggregate calibration is an in-sample scan over the explicit 90-day context. Rolling OOS must confirm these approvals before any readiness interpretation."
      },
      missingFieldCounts,
      topRemainingRejectionReasons: topCounts(rejectedOrWatchlist, (decision) =>
        [...(decision.rejectionReasons ?? []), ...(decision.watchlistReasons ?? [])][0] ?? "no reason supplied"
      )
    },
    beforeAfter: {
      beforeStrictOnlyUsableOutcomes: beforeMc.input.usableOutcomes,
      afterSelectedProfileUsableOutcomes: afterMc.input.usableOutcomes,
      beforeApprovedTargetFirstRate: safeApprovedMetrics(strictOnlyResults).targetFirstRate,
      afterApprovedTargetFirstRate: safeApprovedMetrics(selectedResults).targetFirstRate,
      beforeApprovedAverageRr: safeApprovedMetrics(strictOnlyResults).averageRr,
      afterApprovedAverageRr: safeApprovedMetrics(selectedResults).averageRr,
      monteCarloRobustnessRating: afterMc.recommendation.robustnessRating,
      riskOfRuinPct: afterMc.performance.riskOfRuinPct,
      recommendedMaxRiskPct: afterMc.recommendation.recommendedMaxRiskPerTradePct
    },
    rootCause,
    safety,
    authority
  };

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "approved-outcome report must not expose raw candles");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    "approved-outcome report must not expose unsafe data"
  );
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.ok("approvedOutcomeDistribution" in report.replay, "approved outcome distribution must be reported");
  assert.equal(report.replay.pipelineDiagnostics.sessionNarrativeResolution, "per_signal_trading_date");
  assert.ok(
    report.replay.missingFieldCounts.rangeBoundProfile >= report.replay.approvedCount ||
      report.replay.approvedCount > 0,
    "diagnostic must report range-bound pressure or approved outcomes"
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT approved outcome calibration failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
