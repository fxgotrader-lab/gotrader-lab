#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-replay-diagnostics-test");
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
  return globalThis.__ICT_REPLAY_DIAGNOSTICS_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_REPLAY_DIAGNOSTICS_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const baseResult = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  phase: "phase_1",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  side: "long",
  setup: "fvg_retracement",
  decision: "research_only",
  confidence: 0.72,
  htfAligned: true,
  dealingRangeLocation: "discount",
  liquidityTargetType: "previous_day_high",
  rrEstimate: 2.4,
  outcome: "target_first",
  fvgStatus: "respected",
  tradePath: {
    signalTime: "2026-06-05T13:00:00.000Z",
    entryReference: 100,
    invalidation: 96,
    target: 110,
    maxFavorableExcursion: 10,
    maxAdverseExcursion: 1,
    candlesToTarget: 3,
    rrAchieved: 2.5
  },
  noTradeReasons: [],
  riskNotes: ["Research only."],
  summary: "fixture",
  researchOnly: true,
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    replay: true,
    researchOnly: true,
    generatedAt: "2026-06-05T13:00:00.000Z"
  },
  ...overrides
});

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const results = [
    baseResult(),
    baseResult({
      phase: "phase_2",
      strategyId: "ict-order-block-taxonomy",
      setup: "order_block_retracement",
      orderBlockVariant: "standard_order_block",
      approvedProfileStatus: "watchlist_candidate",
      confidence: 0.68,
      rrEstimate: 2.1,
      fvgStatus: "not_applicable",
      outcome: "partial_target",
      tradePath: { ...baseResult().tradePath, signalTime: "2026-06-05T14:00:00.000Z", rrAchieved: 1.3 }
    }),
    baseResult({
      strategyId: "ict-liquidity-pool",
      setup: "sellside_sweep_bullish_displacement",
      confidence: 0.65,
      rrEstimate: 1.8,
      tradePath: { ...baseResult().tradePath, rrAchieved: 1.5 },
      fvgStatus: "ignored",
      outcome: "partial_target"
    }),
    baseResult({
      strategyId: "ict-daily-range",
      setup: "daily_range_projection",
      side: "short",
      confidence: 0.55,
      rrEstimate: 0.8,
      htfAligned: false,
      dealingRangeLocation: "equilibrium",
      liquidityTargetType: "session_low",
      fvgStatus: "not_applicable",
      outcome: "invalidation_first",
      tradePath: { ...baseResult().tradePath, signalTime: "2026-06-05T09:00:00.000Z", rrAchieved: -1 },
      noTradeReasons: []
    }),
    baseResult({
      strategyId: "ict-htf-bias",
      setup: "htf_bias_only",
      side: "flat",
      decision: "no_trade",
      confidence: 0.35,
      htfAligned: undefined,
      dealingRangeLocation: undefined,
      liquidityTargetType: undefined,
      rrEstimate: undefined,
      outcome: "no_trade",
      fvgStatus: "not_applicable",
      tradePath: { signalTime: "2026-06-05T02:00:00.000Z" },
      noTradeReasons: ["Missing higher-timeframe context."]
    }),
    baseResult({
      strategyId: "ict-fvg-displacement",
      setup: "fvg_retracement",
      confidence: 0.82,
      rrEstimate: 3.4,
      fvgStatus: "fully_mitigated",
      outcome: "stalled",
      tradePath: { ...baseResult().tradePath, signalTime: "2026-06-05T16:00:00.000Z", rrAchieved: 0.2 },
      noTradeReasons: ["Target too close to current price."]
    })
  ];

  const diagnostics = suite.buildReplayDiagnostics(results);
  assert.equal(diagnostics.researchOnly, true);
  assert.equal(diagnostics.totalResults, results.length);
  assert.equal(diagnostics.totalSignals, 5);
  assert.ok(diagnostics.byStrategyId["ict-fvg-displacement"], "strategy breakdown missing");
  assert.ok(diagnostics.byPhase.phase_2, "Phase 2 breakdown missing");
  assert.ok(diagnostics.bySetup.fvg_retracement, "setup breakdown missing");
  assert.ok(diagnostics.byPhase2Setup.order_block_retracement, "Phase 2 setup breakdown missing");
  assert.ok(diagnostics.byOrderBlockVariant.standard_order_block, "order-block variant breakdown missing");
  assert.ok(diagnostics.byApprovedProfileStatus.watchlist_candidate, "approved profile status breakdown missing");
  assert.ok(diagnostics.bySide.long, "side breakdown missing");
  assert.ok(diagnostics.byConfidenceBucket["61-80"], "confidence bucket missing");
  assert.ok(diagnostics.byRrBucket["2r_to_3r"], "RR bucket missing");
  assert.ok(diagnostics.byFvgStatus.respected, "FVG breakdown missing");
  assert.ok(diagnostics.byDealingRangeLocation.discount, "dealing range breakdown missing");
  assert.ok(diagnostics.byLiquidityTargetType.previous_day_high, "liquidity target breakdown missing");
  assert.ok(diagnostics.bySession["New York"], "session breakdown missing");
  assert.ok(diagnostics.mostCommonNoTradeReasons.some((item) => item.reason === "Missing higher-timeframe context."));

  const confidenceFiltered = suite.runReplayCalibrationSuite(results, [
    { id: "test_min_confidence", label: "Test min confidence", enabled: true, minConfidence: 0.7 }
  ])[0];
  assert.ok(confidenceFiltered.after.totalSignals < confidenceFiltered.before.totalSignals, "min confidence should reduce signal count");
  assert.ok(typeof confidenceFiltered.delta.targetFirstRateChange === "number", "target-first delta should be reported");

  const rrFiltered = suite.runReplayCalibrationSuite(results, [
    { id: "test_min_rr", label: "Test min RR", enabled: true, minRr: 2 }
  ])[0];
  assert.ok(rrFiltered.after.totalSignals < rrFiltered.before.totalSignals, "min RR should reduce signal count");
  assert.ok(typeof rrFiltered.delta.averageRrChange === "number", "average RR delta should be reported");

  const defaults = suite.getDefaultReplayCalibrationFilters();
  assert.ok(defaults.some((filter) => filter.id === "fvg_respected_required"));
  assert.ok(defaults.some((filter) => filter.id === "ny_session_only"));

  const calibrationResults = suite.runReplayCalibrationSuite(results, defaults);
  const journalEvent = suite.buildIctReplayDiagnosticsJournalEvent({ calibrationResults, diagnostics, runId: "test_run" });
  assert.equal(journalEvent.eventType, "ict_replay_diagnostics_summary");
  assert.equal(journalEvent.researchOnly, true);
  assert.equal(journalEvent.authority.executionAuthority, "none");
  assert.equal(journalEvent.authority.brokerAuthority, "none");
  assert.equal(journalEvent.authority.readinessOverrideAuthority, "none");
  assert.equal(journalEvent.safety.rawCandlesExcluded, true);
  assert.equal(suite.assertIctReplayDiagnosticsOutputIsCompact({ diagnostics, calibrationResults, journalEvent }).ok, true);
  assert.doesNotMatch(JSON.stringify({ diagnostics, calibrationResults, journalEvent }), /"candles"\s*:/i);

  process.stdout.write("GoTrader ICT Replay Diagnostics smoke test passed.\n");
  process.stdout.write(`Signals diagnosed: ${diagnostics.totalSignals}\n`);
  process.stdout.write(`Baseline target-first rate: ${Math.round(diagnostics.baseline.targetFirstRate * 100)}%\n`);
  process.stdout.write(`Calibration filters tested: ${calibrationResults.length}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT Replay Diagnostics smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
