#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-latest-research-state-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictCurrentReadTypes.ts" },
  { root: sourceRoot, file: "ictCurrentRead.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizerTypes.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizer.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
  { root: sourceRoot, file: "ictMonteCarloTypes.ts" },
  { root: sourceRoot, file: "ictMonteCarlo.ts" },
  { root: sourceRoot, file: "ictLatestResearchStateTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchState.ts" },
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
  { root: sourceRoot, file: "ictResearchReport.ts" },
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
  { root: mt5Root, file: "mt5ReadOnlyClient.ts" },
  { root: sourceRoot, file: "index.ts" }
];

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
  return globalThis.__ICT_LATEST_RESEARCH_STATE_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_LATEST_RESEARCH_STATE_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  secretsExcluded: true
};

const manualReplayFixture = () => ({
  status: "completed",
  runId: "manual_replay_latest_fixture",
  generatedAt: "2026-06-05T16:00:00.000Z",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  candleLimit: 1000,
  replayWindowSize: 80,
  lookaheadCandles: 12,
  totalWindows: 20,
  totalSignals: 14,
  totalNoTrades: 3,
  targetFirstRate: 0.42,
  invalidationFirstRate: 0.28,
  averageRrAchieved: 0.72,
  approvedProfileCounts: { totalApproved: 6, totalWatchlist: 3, totalRejected: 4, totalNoTrade: 1 },
  approvedTargetFirstRate: 0.5,
  approvedAverageRr: 1.1,
  mostCommonNoTradeReasons: [],
  bestSetup: undefined,
  worstSetup: undefined,
  smtSummary: { divergenceTypes: [], confirmation: [], rejection: [] },
  newsSessionRiskSummary: { newsRiskLevels: [], sessionRiskStates: [], riskGovernorActions: [] },
  topCalibrationFilterImprovements: [],
  approvedProfileComparison: [],
  monteCarloOutcomes: [{ id: "outcome", rMultiple: 1.2, outcome: "target_first", researchOnly: true }],
  candles: [{ timestamp: "should_not_persist" }],
  rawSnapshot: { source: "should_not_persist" },
  errors: [],
  warnings: ["fixture warning"],
  researchOnly: true,
  authority,
  safety
});

const monteCarloFixture = () => ({
  source: "manual_replay_review",
  generatedAt: "2026-06-05T16:05:00.000Z",
  researchOnly: true,
  input: {
    totalOutcomes: 30,
    usableOutcomes: 24,
    approvedOnly: true,
    watchlistIncluded: false,
    simulationCount: 150,
    tradesPerSimulation: 30,
    riskPerTradePct: 0.5
  },
  performance: {
    medianEndingR: 8.4,
    fifthPercentileEndingR: -2.1,
    ninetyFifthPercentileEndingR: 18.2,
    medianMaxDrawdownR: 1.5,
    worstMaxDrawdownR: 5.8,
    medianMaxDrawdownPct: 2.4,
    worstMaxDrawdownPct: 9.2,
    medianLongestLosingStreak: 3,
    worstLongestLosingStreak: 7,
    riskOfRuinPct: 4.2,
    probabilityDrawdownOverLimitPct: 8,
    averageWinRate: 0.54
  },
  recommendation: {
    robustnessRating: "moderate",
    recommendedMaxRiskPerTradePct: 0.35,
    reason: "Fixture moderate result.",
    warnings: ["sample still limited"]
  },
  pathsSample: [{ simulationId: "path_should_not_persist", endingR: 0 }],
  authority,
  safety
});

const scorecardFixture = () => ({
  runId: "scorecard_latest_fixture",
  generatedAt: "2026-06-05T16:10:00.000Z",
  researchOnly: true,
  config: {
    requestedSymbols: ["MNQ", "ES", "YM"],
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candleLimit: 1000,
    replayWindowSize: 80,
    lookaheadCandles: 12
  },
  symbols: [],
  summary: {
    completedSymbols: 3,
    unavailableSymbols: 0,
    researchPreferredSymbols: ["MNQ"],
    watchlistOnlySymbols: ["ES"],
    noisySymbols: ["YM"],
    bestApprovedTargetFirstSymbol: "MNQ",
    bestApprovedRrSymbol: "MNQ",
    cleanestSymbol: "MNQ"
  },
  monteCarloOutcomes: [{ id: "scorecard_outcome_should_not_persist", rMultiple: 1, outcome: "target_first", researchOnly: true }],
  accountData: { blocked: true },
  authority,
  safety
});

const compactPacket = (decision) => {
  const signal = {
    strategyId: "ict-fvg-displacement",
    phase: "phase_1",
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    side: "long",
    decision: "research_only",
    confidence: 0.72,
    bias: { primary: "bullish", htf: { "15m": "bullish", "1h": "bullish" }, composite: "bullish" },
    setup: "fvg_retracement",
    summary: "latest state fixture signal",
    noTradeReasons: [],
    riskNotes: ["Research only."],
    provenance: {
      methodology: "ICT",
      phase: "phase_1",
      sourceSet: "ICT Mentorship Core Content",
      researchOnly: true,
      generatedAt: "2026-06-05T16:00:00.000Z"
    },
    approvedProfileDecision: decision
  };
  return {
    packetId: "latest_state_packet",
    source: "gotrader_ict_strategy_suite",
    mode: "advisory_only",
    generatedAt: "2026-06-05T16:00:00.000Z",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    activeSource: {
      provider: "mt5_read_only",
      candleCount: 1000,
      firstTimestamp: "2026-06-02T09:40:00.000Z",
      lastTimestamp: "2026-06-05T23:55:00.000Z",
      sourceFingerprint: "latest_state_source_fp",
      sourceLabel: "MT5 read-only USTECH latest-state fixture"
    },
    signals: [signal],
    recommendedSignal: signal,
    compactSummary: {
      compositeBias: "bullish",
      setup: "fvg_retracement",
      decision: "research_only",
      side: "long",
      confidence: 0.72,
      approvedProfileStatus: decision.status,
      approvalScore: decision.approvalScore,
      noTradeReasonCount: 0
    },
    approvedProfileDecision: decision,
    journalEvents: [],
    indexSmtJournalEvents: [],
    newsSessionRiskJournalEvents: [],
    journalStatus: "memory_only",
    safetyLocks: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false
    },
    authority
  };
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  suite.clearLatestResearchState();
  assert.equal(suite.readLatestResearchState(), undefined);

  const replaySnapshot = suite.buildLatestReplaySnapshot(manualReplayFixture());
  assert.equal(replaySnapshot.runId, "manual_replay_latest_fixture");
  assert.equal(replaySnapshot.totalSignals, 14);
  assert.equal(replaySnapshot.researchOnly, true);
  assert.doesNotMatch(JSON.stringify(replaySnapshot), /candles|monteCarloOutcomes|rawSnapshot/i);

  const monteCarloSnapshot = suite.buildLatestMonteCarloSnapshot(monteCarloFixture());
  assert.equal(monteCarloSnapshot.robustnessRating, "moderate");
  assert.equal(monteCarloSnapshot.usableOutcomes, 24);
  assert.equal(monteCarloSnapshot.riskOfRuinPct, 4.2);
  assert.doesNotMatch(JSON.stringify(monteCarloSnapshot), /pathsSample|simulationId|candles/i);

  const scorecardSnapshot = suite.buildLatestScorecardSnapshot(scorecardFixture());
  assert.deepEqual(scorecardSnapshot.researchPreferredSymbols, ["MNQ"]);
  assert.equal(scorecardSnapshot.bestApprovedTargetFirstSymbol, "MNQ");
  assert.doesNotMatch(JSON.stringify(scorecardSnapshot), /monteCarloOutcomes|accountData|candles/i);

  const replayState = suite.saveLatestResearchStatePatch({ latestReplay: replaySnapshot }, "manual_replay_review");
  assert.ok(replayState.latestReplay);
  assert.ok(!replayState.latestMonteCarlo);
  const monteCarloState = suite.saveLatestResearchStatePatch({ latestMonteCarlo: monteCarloSnapshot }, "monte_carlo");
  assert.ok(monteCarloState.latestReplay, "latest state should merge patches without losing replay");
  assert.ok(monteCarloState.latestMonteCarlo);
  const fullState = suite.saveLatestResearchStatePatch({ latestScorecard: scorecardSnapshot }, "market_scorecard");
  assert.ok(fullState.latestReplay);
  assert.ok(fullState.latestMonteCarlo);
  assert.ok(fullState.latestScorecard);
  assert.equal(fullState.researchOnly, true);
  assert.equal(fullState.authority.executionAuthority, "none");
  assert.equal(fullState.safety.rawCandlesExcluded, true);
  assert.equal(suite.assertIctLatestResearchStateIsCompact(fullState).ok, true);
  assert.doesNotMatch(JSON.stringify(fullState), /"candles"\s*:|"pathsSample"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"secret"\s*:|"accountData"\s*:|"orderData"\s*:|"positionData"\s*:/i);

  const journalEvent = suite.buildIctLatestResearchStateJournalEvent(fullState, "monte_carlo");
  const journalResult = suite.appendIctLatestResearchStateJournalEvent(journalEvent);
  assert.equal(journalResult.ok, true);
  assert.equal(journalEvent.eventType, "ict_latest_research_state_updated");
  assert.equal(journalEvent.researchOnly, true);
  assert.equal(suite.assertIctLatestResearchStateIsCompact(fullState, journalEvent).ok, true);

  const decision = {
    profileId: "strict",
    label: "Strict",
    status: "watchlist_candidate",
    approvalScore: 68,
    approvedReasons: ["Fixture watchlist."],
    watchlistReasons: ["Needs manual replay."],
    rejectionReasons: [],
    hardFilterFailures: [],
    softFilterWarnings: [],
    researchOnly: true,
    authority
  };
  const currentRead = suite.buildIctCurrentReadFromPacket(compactPacket(decision), fullState);
  assert.equal(currentRead.latestReplayStatus, "target-first 50%");
  assert.equal(currentRead.latestMonteCarloRobustness, "moderate");
  assert.equal(currentRead.latestMonteCarloRiskOfRuinPct, 4.2);
  assert.equal(currentRead.latestMonteCarloRecommendedRiskPct, 0.35);
  assert.equal(currentRead.latestScorecardBestSymbol, "MNQ");
  assert.deepEqual(currentRead.latestScorecardResearchPreferredSymbols, ["MNQ"]);
  assert.match(currentRead.latestResearchStateNote, /manual research result/i);
  assert.equal(suite.assertIctCurrentReadIsCompact(currentRead).ok, true);

  const dashboardSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "IctAdvisorSummaryPanel.tsx"), "utf8");
  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  assert.match(dashboardSource, /readLatestResearchState/, "Dashboard compact advisor card should read shared latest state");
  assert.match(dashboardSource, /Latest Monte Carlo|Monte Carlo/, "Dashboard should render latest Monte Carlo copy");
  assert.doesNotMatch(dashboardSource, /No Monte Carlo engine wired yet/, "Dashboard must not show stale planned-only copy");
  assert.match(advisorSource, /data-testid="ict-latest-research-state"/, "Research Advisor should render Latest Research State");
  assert.match(advisorSource, /Latest Replay Saved/, "Manual replay panel should confirm latest replay persistence");
  assert.match(advisorSource, /Latest Robustness Saved/, "Monte Carlo panel should confirm latest robustness persistence");
  assert.match(advisorSource, /Latest Scorecard Saved/, "Scorecard panel should confirm latest scorecard persistence");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,900}runManualReplayReview/, "Manual replay must not auto-run on page load");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,900}runMonteCarloRobustness/, "Monte Carlo must not auto-run on page load");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,900}runMarketScorecard/, "Market scorecard must not auto-run on page load");
  assert.doesNotMatch(`${dashboardSource}\n${advisorSource}`, /<Button[^>]*>\s*(Buy|Sell|Execute|Place Order|Buy Market|Sell Market|Enable Live Trading|Connect Live Broker)/i);

  process.stdout.write("GoTrader ICT Latest Research State smoke test passed.\n");
  process.stdout.write(`Replay: ${currentRead.latestReplayStatus}\n`);
  process.stdout.write(`Monte Carlo: ${currentRead.latestMonteCarloRobustness} / risk of ruin ${currentRead.latestMonteCarloRiskOfRuinPct}%\n`);
  process.stdout.write(`Scorecard best: ${currentRead.latestScorecardBestSymbol}\n`);
  process.stdout.write(`Authority: ${currentRead.authority.executionAuthority}/${currentRead.authority.brokerAuthority}/${currentRead.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT latest research state smoke test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
