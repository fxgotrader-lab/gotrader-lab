#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-research-report-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
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
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizer.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
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
  return globalThis.__ICT_RESEARCH_REPORT_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_RESEARCH_REPORT_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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

const manualReplayResult = {
  status: "completed",
  runId: "manual_fixture",
  generatedAt: "2026-06-05T12:00:00.000Z",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  candleLimit: 1000,
  replayWindowSize: 80,
  lookaheadCandles: 12,
  totalWindows: 25,
  totalSignals: 120,
  totalNoTrades: 30,
  targetFirstRate: 0.32,
  invalidationFirstRate: 0.41,
  averageRrAchieved: 1.2,
  approvedProfileCounts: {
    totalApproved: 8,
    totalWatchlist: 10,
    totalRejected: 70,
    totalNoTrade: 32
  },
  approvedTargetFirstRate: 0.56,
  approvedAverageRr: 2.3,
  mostCommonNoTradeReasons: [{ reason: "liquidity_not_clean", count: 12 }],
  bestSetup: {
    key: "silver_bullet",
    total: 20,
    totalSignals: 15,
    targetFirstRate: 0.6,
    invalidationFirstRate: 0.25,
    averageRrAchieved: 2.4
  },
  worstSetup: {
    key: "turtle_soup",
    total: 18,
    totalSignals: 12,
    targetFirstRate: 0.18,
    invalidationFirstRate: 0.7,
    averageRrAchieved: 0.4
  },
  smtSummary: {
    divergenceTypes: [{ key: "bullish_smt", total: 6, totalSignals: 5, targetFirstRate: 0.4, invalidationFirstRate: 0.4, averageRrAchieved: 1.5 }],
    confirmation: [{ key: "confirms", total: 20, totalSignals: 18, targetFirstRate: 0.5, invalidationFirstRate: 0.3, averageRrAchieved: 2.1 }],
    rejection: [{ key: "rejects", total: 8, totalSignals: 7, targetFirstRate: 0.15, invalidationFirstRate: 0.7, averageRrAchieved: 0.2 }]
  },
  newsSessionRiskSummary: {
    newsRiskLevels: [{ key: "medium", total: 4, totalSignals: 3, targetFirstRate: 0.2, invalidationFirstRate: 0.5, averageRrAchieved: 0.7 }],
    sessionRiskStates: [{ key: "caution", total: 5, totalSignals: 4, targetFirstRate: 0.25, invalidationFirstRate: 0.5, averageRrAchieved: 0.8 }],
    riskGovernorActions: [{ key: "allow", total: 80, totalSignals: 70, targetFirstRate: 0.42, invalidationFirstRate: 0.3, averageRrAchieved: 1.8 }]
  },
  topCalibrationFilterImprovements: [
    {
      filterId: "min_confidence_70",
      label: "Minimum confidence 70",
      beforeSignals: 120,
      afterSignals: 35,
      targetFirstRateChange: 0.12,
      averageRrChange: 0.8,
      signalReductionPct: 0.7
    }
  ],
  approvedProfileComparison: [
    {
      profileId: "gotrader_ict_phase1_strict",
      label: "Strict ICT Profile",
      totalSignalsBefore: 120,
      totalApproved: 8,
      totalWatchlist: 10,
      totalRejected: 70,
      totalNoTrade: 32,
      signalReductionPct: 0.65,
      approvedTargetFirstRate: 0.56,
      approvedAverageRr: 2.3,
      topRejectionReasons: [{ reason: "profile_filter", count: 40 }]
    }
  ],
  errors: [],
  warnings: ["MT5 read-only proxy context only."],
  researchOnly: true,
  authority,
  safety
};

const marketScorecard = {
  runId: "scorecard_fixture",
  generatedAt: "2026-06-05T12:05:00.000Z",
  researchOnly: true,
  config: {
    requestedSymbols: ["MNQ", "ES", "YM"],
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candleLimit: 1000,
    replayWindowSize: 80,
    lookaheadCandles: 12
  },
  symbols: [
    {
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      displayLabel: "USTECH -> MNQ",
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      status: "research_preferred",
      statusReason: "Approved profile improves target-first quality.",
      totalWindows: 20,
      totalSignals: 80,
      totalNoTrades: 10,
      broadTargetFirstRate: 0.35,
      broadAverageRr: 1.2,
      approvedCount: 10,
      watchlistCount: 4,
      rejectedCount: 20,
      noTradeCount: 46,
      approvedRejectedRatio: 0.5,
      approvedTargetFirstRate: 0.58,
      approvedAverageRr: 2.6,
      signalReductionPct: 0.7,
      smtConfirmRate: 0.4,
      smtRejectRate: 0.15,
      newsBlockedCount: 3,
      newsCautionCount: 6,
      topSetup: "silver_bullet",
      worstSetup: "turtle_soup",
      mostCommonNoTradeReasons: [{ reason: "liquidity_not_clean", count: 8 }],
      researchOnly: true
    },
    {
      requestedSymbol: "ES",
      brokerSymbol: "US500",
      displayLabel: "US500 -> ES",
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      status: "watchlist_only",
      statusReason: "Some watchlist evidence exists.",
      totalWindows: 18,
      totalSignals: 50,
      totalNoTrades: 8,
      broadTargetFirstRate: 0.36,
      broadAverageRr: 1.1,
      approvedCount: 1,
      watchlistCount: 5,
      rejectedCount: 22,
      noTradeCount: 22,
      approvedRejectedRatio: 0.05,
      approvedTargetFirstRate: 0.36,
      approvedAverageRr: 1.4,
      signalReductionPct: 0.1,
      smtConfirmRate: 0.2,
      smtRejectRate: 0.2,
      newsBlockedCount: 1,
      newsCautionCount: 2,
      topSetup: "breaker",
      mostCommonNoTradeReasons: [{ reason: "range_not_clean", count: 6 }],
      researchOnly: true
    }
  ],
  summary: {
    completedSymbols: 2,
    unavailableSymbols: 0,
    researchPreferredSymbols: ["MNQ"],
    watchlistOnlySymbols: ["ES"],
    noisySymbols: [],
    bestApprovedTargetFirstSymbol: "MNQ",
    bestApprovedRrSymbol: "MNQ",
    bestApprovedRejectedRatioSymbol: "MNQ",
    cleanestSymbol: "MNQ"
  },
  authority,
  safety
};

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

function assertCompactReport(suite, report, label) {
  assert.equal(report.researchOnly, true, `${label}: report must be research-only`);
  assert.equal(report.authority.executionAuthority, "none", `${label}: execution authority must be none`);
  assert.equal(report.authority.brokerAuthority, "none", `${label}: broker authority must be none`);
  assert.equal(report.authority.readinessOverrideAuthority, "none", `${label}: readiness authority must be none`);
  assert.equal(report.safety.rawCandlesExcluded, true, `${label}: raw candles excluded flag missing`);
  assert.equal(report.safety.rawSnapshotsExcluded, true, `${label}: raw snapshots excluded flag missing`);
  assert.equal(report.safety.secretsExcluded, true, `${label}: secrets excluded flag missing`);
  assert.equal(report.safety.accountDataExcluded, true, `${label}: account data excluded flag missing`);
  assert.equal(report.safety.orderDataExcluded, true, `${label}: order data excluded flag missing`);
  assert.equal(report.safety.positionDataExcluded, true, `${label}: position data excluded flag missing`);
  assert.equal(suite.assertIctResearchReportOutputIsCompact({ report }).ok, true, `${label}: compact assertion failed`);
  const serialized = JSON.stringify({ ...report, safety: undefined });
  assert.doesNotMatch(serialized, /"candles"\s*:/i, `${label}: raw candles must not appear`);
  assert.doesNotMatch(serialized, /"windows"\s*:/i, `${label}: raw windows must not appear`);
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    `${label}: unsafe fields must not appear`
  );
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  const manualReport = suite.buildManualReplayResearchReport(manualReplayResult);
  assert.equal(manualReport.source, "manual_replay_review", "manual report source mismatch");
  assert.equal(manualReport.summary.requestedSymbols[0], "MNQ", "manual report requested symbol mismatch");
  assert.equal(manualReport.summary.approvedTargetFirstRate, 0.56, "manual report approved target-first mismatch");
  assert.ok(manualReport.sections.some((section) => section.heading === "Main Reasons"), "manual report should include main reasons");
  assertCompactReport(suite, manualReport, "manual replay report");

  const scorecardReport = suite.buildMarketScorecardResearchReport(marketScorecard);
  assert.equal(scorecardReport.source, "market_scorecard", "scorecard report source mismatch");
  assert.deepEqual(scorecardReport.summary.researchPreferredSymbols, ["MNQ"], "scorecard report research-preferred mismatch");
  assert.equal(scorecardReport.summary.bestApprovedRrSymbol, "MNQ", "scorecard best RR mismatch");
  assert.ok(scorecardReport.sections.some((section) => section.heading === "Per-Market Compact Results"), "scorecard report should include per-market compact results");
  assertCompactReport(suite, scorecardReport, "market scorecard report");

  const journalEvent = suite.buildIctResearchReportSavedJournalEvent(manualReport);
  assert.equal(journalEvent.eventType, "ict_research_report_saved", "research report saved journal event type mismatch");
  assert.equal(journalEvent.researchOnly, true, "journal event must be research-only");
  assert.equal(journalEvent.authority.executionAuthority, "none", "journal event execution authority must be none");
  assert.equal(suite.assertIctResearchReportOutputIsCompact({ report: manualReport, journalEvent }).ok, true, "journal compact assertion failed");
  assert.doesNotMatch(JSON.stringify({ ...journalEvent, safety: undefined }), /"candles"\s*:/i, "journal must not contain raw candles");

  const unavailableSave = suite.saveIctResearchReport(manualReport);
  assert.equal(unavailableSave.status, "unavailable", "Node save should degrade safely when browser storage is unavailable");
  assert.equal(unavailableSave.researchOnly, true, "save result must be research-only");

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    localStorage: createMemoryLocalStorage(),
    dispatchEvent: () => true
  };
  const savedManual = suite.saveIctResearchReport(manualReport);
  const savedScorecard = suite.saveIctResearchReport(scorecardReport);
  assert.equal(savedManual.status, "saved", "manual report should save with browser localStorage");
  assert.equal(savedScorecard.status, "saved", "scorecard report should save with browser localStorage");
  const reports = suite.listIctResearchReports();
  assert.equal(reports.length, 2, "local report list should contain two saved reports");
  assert.equal(suite.readIctResearchReport(manualReport.reportId)?.reportId, manualReport.reportId, "read report should find manual report");
  assert.ok(suite.summarizeIctResearchReport(manualReport).includes("MNQ"), "manual summary should mention MNQ");
  assert.ok(suite.summarizeIctResearchReport(scorecardReport).includes("MNQ"), "scorecard summary should mention research-preferred MNQ");
  const savedJournalEvents = suite.readIctResearchReportSavedJournalEvents();
  assert.equal(savedJournalEvents.length, 2, "save should append compact report saved journal events");
  assert.equal(savedJournalEvents.every((event) => event.researchOnly === true), true, "saved report journal events must remain research-only");

  process.stdout.write("GoTrader ICT Research Report smoke test passed.\n");
  process.stdout.write(`Manual report: ${manualReport.reportId}\n`);
  process.stdout.write(`Scorecard report: ${scorecardReport.reportId}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        savedReports: reports.length,
        manualSaveStatus: savedManual.status,
        scorecardSaveStatus: savedScorecard.status,
        authority: manualReport.authority,
        safety: manualReport.safety
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`ICT Research Report smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
