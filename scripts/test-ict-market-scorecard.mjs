#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-market-scorecard-test");
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
  { root: sourceRoot, file: "ictMonteCarloTypes.ts" },
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
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
  return globalThis.__ICT_MARKET_SCORECARD_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_MARKET_SCORECARD_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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

const emptyBuckets = () => ({
  byStrategyId: {},
  byPhase: {},
  bySetup: {},
  byPhase2Setup: {},
  byOrderBlockVariant: {},
  byApprovedProfileStatus: {},
  bySide: {},
  bySymbol: {},
  byPrimaryTimeframe: {},
  byHtfAlignment: {},
  bySession: {},
  byConfidenceBucket: {},
  byRrBucket: {},
  byFvgStatus: {},
  byDealingRangeLocation: {},
  byLiquidityTargetType: {},
  bySmtDivergenceType: {},
  bySmtConfirmsCandidate: {},
  bySmtRejectsCandidate: {},
  byRelativeStrengthLeader: {},
  byRelativeWeaknessLeader: {},
  byNewsRiskLevel: {},
  bySessionRiskState: {},
  byRiskGovernorAction: {}
});

const metric = (key, totalSignals, targetFirstRate = 0.4, averageRrAchieved = 1.5, total = totalSignals) => ({
  key,
  total,
  totalSignals,
  totalNoTrades: 0,
  targetFirstCount: Math.round(totalSignals * targetFirstRate),
  invalidationFirstCount: Math.round(totalSignals * Math.max(0, 1 - targetFirstRate - 0.1)),
  partialTargetCount: Math.round(totalSignals * 0.05),
  stalledCount: Math.round(totalSignals * 0.05),
  targetFirstRate,
  invalidationFirstRate: Math.max(0, 1 - targetFirstRate - 0.1),
  averageRrAchieved
});

function fakeReplayResult({
  approvedAverageRr = 0,
  approvedCount = 0,
  approvedTargetFirstRate = 0,
  brokerSymbol = "USTECH",
  broadAverageRr = 1,
  broadTargetFirstRate = 0.3,
  displayLabel = "USTECH -> MNQ",
  htfTimeframes = ["15m", "1h"],
  noTradeReasons = [{ reason: "liquidity_not_clean", count: 2 }],
  primaryTimeframe = "5m",
  requestedSymbol = "MNQ",
  signalReductionPct = 0,
  status = "completed",
  statusReason,
  totalNoTrades = 2,
  totalSignals = 20,
  totalWindows = 10,
  watchlistCount = 0
} = {}) {
  const completed = status === "completed";
  return {
    runId: `fixture_${requestedSymbol}`,
    generatedAt: "2026-06-05T12:00:00.000Z",
    researchOnly: true,
    authority,
    config: {
      requestedSymbols: [requestedSymbol],
      primaryTimeframes: [primaryTimeframe],
      htfTimeframes,
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12,
      minRequiredCandles: 120,
      researchOnly: true
    },
    symbols: [
      {
        requestedSymbol,
        brokerSymbol,
        displayLabel,
        primaryTimeframe,
        htfTimeframes,
        status,
        reason: statusReason,
        summary: completed
          ? {
              totalWindows,
              totalSignals,
              totalNoTrades,
              targetFirstCount: Math.round(totalSignals * broadTargetFirstRate),
              invalidationFirstCount: Math.round(totalSignals * 0.35),
              partialTargetCount: Math.round(totalSignals * 0.1),
              stalledCount: Math.round(totalSignals * 0.05),
              targetFirstRate: broadTargetFirstRate,
              invalidationFirstRate: 0.35,
              partialTargetRate: 0.1,
              stalledRate: 0.05,
              insufficientFutureCandlesCount: 0,
              averageRrAchieved: broadAverageRr,
              mostCommonNoTradeReasons: noTradeReasons
            }
          : undefined
      }
    ],
    aggregateSummary: {
      totalSymbols: 1,
      completedSymbols: completed ? 1 : 0,
      failedSymbols: status === "failed" ? 1 : 0,
      totalWindows: completed ? totalWindows : 0,
      totalSignals: completed ? totalSignals : 0,
      totalNoTrades: completed ? totalNoTrades : 0,
      targetFirstRate: completed ? broadTargetFirstRate : 0,
      invalidationFirstRate: completed ? 0.35 : 0,
      partialTargetRate: completed ? 0.1 : 0,
      stalledRate: completed ? 0.05 : 0,
      insufficientFutureCandlesCount: 0,
      averageRrAchieved: completed ? broadAverageRr : 0,
      mostCommonNoTradeReasons: completed ? noTradeReasons : [],
      bySymbol: {},
      byTimeframe: {},
      bySession: {}
    },
    diagnostics: {
      researchOnly: true,
      generatedAt: "2026-06-05T12:00:00.000Z",
      totalResults: completed ? totalSignals + totalNoTrades : 0,
      totalSignals: completed ? totalSignals : 0,
      baseline: {
        targetFirstRate: completed ? broadTargetFirstRate : 0,
        invalidationFirstRate: completed ? 0.35 : 0,
        averageRrAchieved: completed ? broadAverageRr : 0
      },
      ...emptyBuckets(),
      bySetup: completed
        ? {
            silver_bullet: metric("silver_bullet", Math.max(1, Math.floor(totalSignals / 2)), 0.52, 2.1),
            turtle_soup: metric("turtle_soup", Math.max(1, Math.floor(totalSignals / 3)), 0.22, 0.8)
          }
        : {},
      bySmtConfirmsCandidate: completed ? { confirms: metric("confirms", Math.round(totalSignals * 0.4), 0.55, 2.1) } : {},
      bySmtRejectsCandidate: completed ? { rejects: metric("rejects", Math.round(totalSignals * 0.15), 0.2, 0.6) } : {},
      byNewsRiskLevel: completed ? { blocked: metric("blocked", 0, 0, 0, 3), medium: metric("medium", 0, 0, 0, 2) } : {},
      bySessionRiskState: completed ? { caution: metric("caution", 0, 0, 0, 4) } : {},
      mostCommonNoTradeReasons: completed ? noTradeReasons : [],
      safety
    },
    calibrationResults: [],
    approvedProfileResults: completed
      ? [
          {
            profileId: "gotrader_ict_phase1_strict",
            label: "Strict ICT Profile",
            researchOnly: true,
            totalSignalsBefore: totalSignals,
            totalApproved: approvedCount,
            totalWatchlist: watchlistCount,
            totalRejected: Math.max(0, totalSignals - approvedCount - watchlistCount - totalNoTrades),
            totalNoTrade: totalNoTrades,
            signalReductionPct,
            approvedTargetFirstRate,
            approvedAverageRr,
            topApprovalReasons: [{ reason: "htf_aligned", count: approvedCount }],
            topRejectionReasons: [{ reason: "profile_filter", count: Math.max(0, totalSignals - approvedCount) }]
          }
        ]
      : [],
    safety
  };
}

function assertCompactScorecard(suite, scorecard, label) {
  assert.equal(scorecard.researchOnly, true, `${label}: scorecard must be research-only`);
  assert.equal(scorecard.authority.executionAuthority, "none", `${label}: execution authority must be none`);
  assert.equal(scorecard.authority.brokerAuthority, "none", `${label}: broker authority must be none`);
  assert.equal(scorecard.authority.readinessOverrideAuthority, "none", `${label}: readiness authority must be none`);
  assert.equal(scorecard.safety.rawCandlesExcluded, true, `${label}: raw candles must be excluded`);
  assert.equal(scorecard.safety.rawSnapshotsExcluded, true, `${label}: raw snapshots must be excluded`);
  assert.equal(scorecard.safety.secretsExcluded, true, `${label}: secrets must be excluded`);
  assert.equal(scorecard.safety.accountDataExcluded, true, `${label}: account data must be excluded`);
  assert.equal(scorecard.safety.orderDataExcluded, true, `${label}: order data must be excluded`);
  assert.equal(scorecard.safety.positionDataExcluded, true, `${label}: position data must be excluded`);
  assert.equal(suite.assertIctMarketScorecardOutputIsCompact({ scorecard }).ok, true, `${label}: compact assertion failed`);
  assert.doesNotMatch(JSON.stringify({ ...scorecard, safety: undefined }), /"candles"\s*:/i, `${label}: raw candle arrays must not appear`);
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  assert.deepEqual(
    [...suite.DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS],
    ["MNQ", "ES", "YM", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    "default market scorecard symbol set mismatch"
  );

  assert.equal(suite.resolveIctRealReplaySymbolMapping("MNQ").brokerSymbol, "USTECH");
  assert.equal(suite.resolveIctRealReplaySymbolMapping("ES").brokerSymbol, "US500");
  assert.equal(suite.resolveIctRealReplaySymbolMapping("YM").brokerSymbol, "US30");

  const researchPreferred = suite.scoreSymbolReplaySummary(
    fakeReplayResult({
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      approvedCount: 10,
      approvedTargetFirstRate: 0.58,
      approvedAverageRr: 2.6,
      broadTargetFirstRate: 0.35,
      signalReductionPct: 0.7,
      totalSignals: 80,
      totalWindows: 20
    })
  );
  assert.equal(researchPreferred.status, "research_preferred", "strong approved profile should be research-preferred");
  assert.equal(researchPreferred.researchOnly, true);

  const watchlist = suite.scoreSymbolReplaySummary(
    fakeReplayResult({
      requestedSymbol: "ES",
      brokerSymbol: "US500",
      approvedCount: 1,
      watchlistCount: 5,
      approvedTargetFirstRate: 0.36,
      approvedAverageRr: 1.4,
      broadTargetFirstRate: 0.36,
      signalReductionPct: 0.1,
      totalSignals: 50,
      totalWindows: 12
    })
  );
  assert.equal(watchlist.status, "watchlist_only", "modest profile evidence should be watchlist-only");

  const noisy = suite.scoreSymbolReplaySummary(
    fakeReplayResult({
      requestedSymbol: "YM",
      brokerSymbol: "US30",
      approvedCount: 0,
      watchlistCount: 0,
      approvedTargetFirstRate: 0.1,
      approvedAverageRr: 0.5,
      broadTargetFirstRate: 0.3,
      signalReductionPct: 0,
      totalSignals: 120,
      totalWindows: 20
    })
  );
  assert.equal(noisy.status, "noisy", "weak approved profile should be noisy");

  const insufficient = suite.scoreSymbolReplaySummary(
    fakeReplayResult({
      requestedSymbol: "BTCUSD",
      brokerSymbol: "BTCUSD",
      totalSignals: 2,
      totalWindows: 1
    })
  );
  assert.equal(insufficient.status, "insufficient_data", "small replay sample should be insufficient");

  const unavailable = suite.scoreSymbolReplaySummary(
    fakeReplayResult({
      requestedSymbol: "XAUUSD",
      brokerSymbol: "XAUUSD",
      status: "skipped",
      statusReason: "mt5_unavailable"
    })
  );
  assert.equal(unavailable.status, "unavailable", "skipped replay should become unavailable");

  const summary = suite.summarizeMarketScorecard([researchPreferred, watchlist, noisy, insufficient, unavailable]);
  assert.equal(summary.bestApprovedTargetFirstSymbol, "MNQ", "summary should identify best approved target-first symbol");
  assert.equal(summary.bestApprovedRrSymbol, "MNQ", "summary should identify best approved RR symbol");
  assert.equal(summary.bestApprovedRejectedRatioSymbol, "MNQ", "summary should identify best approved/rejected ratio symbol");
  assert.deepEqual(summary.researchPreferredSymbols, ["MNQ"]);
  assert.deepEqual(summary.watchlistOnlySymbols, ["ES"]);
  assert.deepEqual(summary.noisySymbols, ["YM"]);

  const scorecard = suite.sanitizeMarketScorecard({
    runId: "scorecard_fixture",
    generatedAt: "2026-06-05T12:00:00.000Z",
    researchOnly: true,
    config: {
      requestedSymbols: ["MNQ", "ES", "YM", "XAUUSD", "BTCUSD"],
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12
    },
    symbols: [researchPreferred, watchlist, noisy, insufficient, unavailable],
    summary,
    authority,
    safety
  });
  assertCompactScorecard(suite, scorecard, "sanitized fixture scorecard");

  const journalEvent = suite.buildIctMarketScorecardJournalEvent(scorecard);
  assert.equal(journalEvent.eventType, "ict_market_scorecard_summary", "journal event type mismatch");
  assert.equal(journalEvent.researchOnly, true, "journal event must be research-only");
  assert.equal(journalEvent.authority.executionAuthority, "none", "journal execution authority must be none");
  assert.equal(suite.assertIctMarketScorecardOutputIsCompact({ scorecard, journalEvent }).ok, true, "journal compact assertion failed");
  assert.doesNotMatch(JSON.stringify({ ...journalEvent, safety: undefined }), /"candles"\s*:/i, "journal must not contain raw candles");

  const builtUnavailable = await suite.buildIctMarketScorecard(
    {
      requestedSymbols: ["MNQ"],
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12
    },
    {
      appendJournal: false,
      fetchCandles: async ({ brokerSymbol, requestedSymbol, timeframe }) => ({
        requestedSymbol,
        brokerSymbol,
        timeframe,
        candles: [],
        candleCount: 0,
        connectionStatus: "disconnected",
        depthStatus: "disconnected",
        warnings: ["Injected unavailable MT5 fixture."],
        missingEvidence: ["mt5_unavailable"]
      })
    }
  );
  assertCompactScorecard(suite, builtUnavailable, "built unavailable scorecard");
  assert.equal(builtUnavailable.symbols[0].status, "unavailable", "builder should degrade safely when MT5 is unavailable");

  process.stdout.write("GoTrader ICT Market Scorecard smoke test passed.\n");
  process.stdout.write(`Research-preferred: ${summary.researchPreferredSymbols.join(", ") || "none"}\n`);
  process.stdout.write(`Watchlist-only: ${summary.watchlistOnlySymbols.join(", ") || "none"}\n`);
  process.stdout.write(`Noisy: ${summary.noisySymbols.join(", ") || "none"}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        completedSymbols: scorecard.summary.completedSymbols,
        unavailableSymbols: scorecard.summary.unavailableSymbols,
        bestApprovedTargetFirstSymbol: scorecard.summary.bestApprovedTargetFirstSymbol,
        bestApprovedRrSymbol: scorecard.summary.bestApprovedRrSymbol,
        bestApprovedRejectedRatioSymbol: scorecard.summary.bestApprovedRejectedRatioSymbol,
        authority: scorecard.authority,
        safety: scorecard.safety
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`ICT Market Scorecard smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
