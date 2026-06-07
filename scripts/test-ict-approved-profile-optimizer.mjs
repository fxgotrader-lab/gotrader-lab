#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-approved-profile-optimizer-test");
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
  return globalThis.__ICT_APPROVED_PROFILE_OPTIMIZER_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_APPROVED_PROFILE_OPTIMIZER_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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

function replayResult(overrides = {}) {
  const signalTime = overrides.signalTime ?? "2026-06-05T13:00:00.000Z";
  return {
    strategyId: "ict-fvg-displacement",
    phase: "phase_1",
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    side: "long",
    setup: "silver_bullet",
    decision: "research_only",
    confidence: 0.72,
    htfAligned: true,
    dealingRangeLocation: "discount",
    liquidityTargetType: "previous_day_high",
    approvedProfileStatus: "watchlist_candidate",
    smtDivergenceType: "bullish_smt",
    smtConfirmsCandidate: true,
    smtRejectsCandidate: false,
    newsRiskLevel: "low",
    sessionRiskState: "preferred",
    riskGovernorAction: "allow",
    rrEstimate: 2.2,
    outcome: "target_first",
    fvgStatus: "respected",
    tradePath: {
      signalTime,
      entryReference: 100,
      invalidation: 98,
      target: 104.4,
      rrAchieved: 2.2
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
      generatedAt: signalTime
    },
    ...overrides
  };
}

const buildFixtureResults = () => {
  const results = [];
  for (let index = 0; index < 30; index += 1) {
    results.push(replayResult({ confidence: 0.76, rrEstimate: 2.4, outcome: "target_first", tradePath: { signalTime: `2026-06-05T13:${String(index % 60).padStart(2, "0")}:00.000Z`, rrAchieved: 2.4 } }));
  }
  for (let index = 0; index < 15; index += 1) {
    results.push(replayResult({ confidence: 0.74, rrEstimate: 2.1, outcome: "invalidation_first", tradePath: { signalTime: `2026-06-05T14:${String(index % 60).padStart(2, "0")}:00.000Z`, rrAchieved: -1 } }));
  }
  for (let index = 0; index < 40; index += 1) {
    results.push(
      replayResult({
        confidence: 0.52,
        htfAligned: false,
        dealingRangeLocation: "equilibrium",
        liquidityTargetType: undefined,
        rrEstimate: 1.4,
        outcome: index % 3 === 0 ? "target_first" : "invalidation_first",
        fvgStatus: "not_applicable",
        smtConfirmsCandidate: false,
        smtRejectsCandidate: index % 4 === 0,
        newsRiskLevel: index % 5 === 0 ? "high" : "medium",
        sessionRiskState: index % 2 === 0 ? "caution" : "avoid",
        riskGovernorAction: "downgrade_to_watchlist",
        tradePath: { signalTime: `2026-06-05T15:${String(index % 60).padStart(2, "0")}:00.000Z`, rrAchieved: index % 3 === 0 ? 1.2 : -1 },
        noTradeReasons: index % 2 === 0 ? ["target is too close"] : []
      })
    );
  }
  for (let index = 0; index < 15; index += 1) {
    results.push(
      replayResult({
        confidence: 0.48,
        htfAligned: false,
        rrEstimate: 1.1,
        outcome: "stalled",
        fvgStatus: "not_applicable",
        smtConfirmsCandidate: false,
        tradePath: { signalTime: `2026-06-05T16:${String(index % 60).padStart(2, "0")}:00.000Z`, rrAchieved: 0.2 }
      })
    );
  }
  return results;
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const results = buildFixtureResults();

  const balanced = suite.optimizeApprovedProfileFromReplayResults(results, "balanced_quality");
  assert.equal(balanced.researchOnly, true, "optimization result must be research-only");
  assert.equal(balanced.authority.executionAuthority, "none", "execution authority must be none");
  assert.equal(balanced.authority.brokerAuthority, "none", "broker authority must be none");
  assert.equal(balanced.authority.readinessOverrideAuthority, "none", "readiness override authority must be none");
  assert.equal(balanced.safety.rawCandlesExcluded, true, "raw candles must be excluded");
  assert.equal(balanced.baseline.totalSignals, 100, "fixture baseline signal count mismatch");
  assert.ok(balanced.recommendedProfile.results.targetFirstRate > balanced.baseline.targetFirstRate, "recommended profile should improve target-first rate");
  assert.ok(balanced.recommendedProfile.results.averageRrAchieved > balanced.baseline.averageRrAchieved, "recommended profile should improve average RR");
  assert.ok(balanced.recommendedProfile.results.signalReductionPct > 0.2, "recommended profile should reduce noisy signals");

  const noisyScore = suite.scoreOptimizationCandidate(
    {
      ...balanced.recommendedProfile,
      id: "approve_nearly_everything_fixture",
      label: "Approve Nearly Everything Fixture",
      minConfidence: 45,
      minRr: 0.1,
      requireHtfAlignment: false,
      requireFvgPresent: false,
      requireExternalLiquidityTarget: false,
      rejectEquilibrium: false,
      rejectTargetTooClose: false,
      requireSmtConfirmationForIndex: false,
      rejectSmtAgainstCandidate: false,
      rejectHighNewsRisk: false,
      rejectMediumNewsRisk: false,
      preferredSessionsOnly: false,
      results: {
        totalSignalsBefore: 0,
        totalSignalsAfter: 0,
        signalReductionPct: 0,
        targetFirstRate: 0,
        averageRrAchieved: 0,
        invalidationFirstRate: 0,
        approvedCount: 0,
        watchlistCount: 0,
        rejectedCount: 0
      },
      score: 0,
      strengths: [],
      weaknesses: []
    },
    results,
    "balanced_quality"
  );
  assert.ok(noisyScore.score < balanced.recommendedProfile.score, "optimizer should penalize approving nearly everything");
  assert.match(noisyScore.weaknesses.join(" "), /nearly everything|noise/i);

  const tooFew = suite.scoreOptimizationCandidate(
    {
      ...balanced.recommendedProfile,
      id: "too_few_fixture",
      label: "Too Few Fixture",
      minConfidence: 80,
      minRr: 3,
      requireHtfAlignment: true,
      requireFvgPresent: true,
      requireExternalLiquidityTarget: true,
      rejectEquilibrium: true,
      requireSmtConfirmationForIndex: true,
      rejectMediumNewsRisk: true,
      preferredSessionsOnly: true,
      results: {
        totalSignalsBefore: 0,
        totalSignalsAfter: 0,
        signalReductionPct: 0,
        targetFirstRate: 0,
        averageRrAchieved: 0,
        invalidationFirstRate: 0,
        approvedCount: 0,
        watchlistCount: 0,
        rejectedCount: 0
      },
      score: 0,
      strengths: [],
      weaknesses: []
    },
    results,
    "balanced_quality"
  );
  assert.ok(tooFew.score < balanced.recommendedProfile.score, "optimizer should penalize too few approved signals");
  assert.match(tooFew.weaknesses.join(" "), /no replay signals|too small/i);

  const targetFirst = suite.optimizeApprovedProfileFromReplayResults(results, "maximize_target_first_rate");
  const averageRr = suite.optimizeApprovedProfileFromReplayResults(results, "maximize_average_rr");
  const reduceNoise = suite.optimizeApprovedProfileFromReplayResults(results, "reduce_noise");
  assert.equal(targetFirst.objective, "maximize_target_first_rate", "target-first objective mismatch");
  assert.equal(averageRr.objective, "maximize_average_rr", "average RR objective mismatch");
  assert.equal(reduceNoise.objective, "reduce_noise", "reduce-noise objective mismatch");
  assert.ok(reduceNoise.recommendedProfile.results.signalReductionPct >= 0.2, "reduce-noise objective should preserve meaningful filtering");

  const journalEvent = suite.buildIctApprovedProfileOptimizationJournalEvent(balanced);
  assert.equal(journalEvent.eventType, "ict_profile_optimization_summary", "journal event type mismatch");
  assert.equal(journalEvent.researchOnly, true, "journal event must be research-only");
  assert.equal(journalEvent.authority.executionAuthority, "none", "journal execution authority must be none");
  assert.equal(suite.assertIctApprovedProfileOptimizationOutputIsCompact({ result: balanced, journalEvent }).ok, true, "optimization compact assertion failed");
  const serialized = JSON.stringify({ result: balanced, journalEvent, safety: undefined });
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "optimization output must omit raw candles");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    "optimization output must omit unsafe fields"
  );

  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  assert.match(advisorSource, /Run Profile Optimization/, "Advisor UI should expose explicit optimization button");
  assert.match(advisorSource, /Profile optimization runs only after explicit user action/, "Advisor UI should not auto-run optimization");

  process.stdout.write("GoTrader ICT Approved Profile Optimizer smoke test passed.\n");
  process.stdout.write(`Recommended profile: ${balanced.recommendedProfile.id}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        baseline: balanced.baseline,
        recommended: {
          minConfidence: balanced.recommendedProfile.minConfidence,
          minRr: balanced.recommendedProfile.minRr,
          signalReductionPct: balanced.recommendedProfile.results.signalReductionPct,
          targetFirstRate: balanced.recommendedProfile.results.targetFirstRate,
          averageRrAchieved: balanced.recommendedProfile.results.averageRrAchieved,
          score: balanced.recommendedProfile.score
        },
        authority: balanced.authority,
        safety: balanced.safety
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`ICT Approved Profile Optimizer smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
