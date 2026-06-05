#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-approved-setup-profile-test");
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
  { root: sourceRoot, file: "ictLatestResearchStateTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchState.ts" },
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
  return globalThis.__ICT_APPROVED_PROFILE_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_APPROVED_PROFILE_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const baseSignal = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  side: "long",
  decision: "research_only",
  confidence: 0.75,
  bias: {
    primary: "bullish",
    htf: {
      "15m": "bullish",
      "1h": "bullish"
    },
    composite: "bullish"
  },
  dealingRange: {
    high: 110,
    low: 90,
    midpoint: 100,
    currentLocation: "discount",
    sourceTimeframe: "5m"
  },
  liquiditySwept: {
    type: "old_swing_low",
    price: 95,
    timeframe: "5m",
    swept: true,
    distanceFromCurrent: -5
  },
  drawOnLiquidity: {
    type: "previous_day_high",
    price: 112,
    timeframe: "daily",
    swept: false,
    distanceFromCurrent: 12
  },
  displacement: {
    direction: "bullish",
    candleTime: "2026-06-05T13:00:00.000Z",
    impulseHigh: 105,
    impulseLow: 98,
    bodySize: 4,
    createdFvg: true
  },
  fairValueGap: {
    direction: "bullish",
    high: 101,
    low: 99,
    midpoint: 100,
    timeframe: "5m",
    mitigated: false,
    createdAt: "2026-06-05T13:00:00.000Z"
  },
  entryZone: {
    type: "fair_value_gap",
    high: 101,
    low: 99,
    midpoint: 100
  },
  invalidation: 96,
  target: 112,
  rrEstimate: 2.4,
  setup: "fvg_retracement",
  summary: "High-quality fixture.",
  noTradeReasons: [],
  riskNotes: ["Research only."],
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-05T13:00:00.000Z"
  },
  ...overrides
});

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const profiles = suite.getDefaultApprovedSetupProfiles();
  const strict = profiles.find((profile) => profile.id === "gotrader_ict_phase1_strict");
  const balanced = profiles.find((profile) => profile.id === "gotrader_ict_phase1_balanced");
  const experimental = profiles.find((profile) => profile.id === "gotrader_ict_phase1_experimental");

  assert.ok(strict, "strict profile should exist");
  assert.ok(balanced, "balanced profile should exist");
  assert.ok(experimental, "experimental profile should exist");

  const approved = suite.evaluateApprovedSetupProfile(baseSignal(), strict);
  assert.equal(approved.status, "approved_research_candidate");
  assert.equal(approved.researchOnly, true);
  assert.equal(approved.authority.executionAuthority, "none");
  assert.equal(approved.authority.brokerAuthority, "none");
  assert.equal(approved.authority.readinessOverrideAuthority, "none");
  assert.equal(approved.safety.rawCandlesExcluded, true);
  assert.equal(suite.assertIctApprovedSetupDecisionIsCompact(approved).ok, true);

  const lowConfidence = suite.evaluateApprovedSetupProfile(baseSignal({ confidence: 0.3 }), strict);
  assert.equal(lowConfidence.status, "rejected_candidate", "strict should reject very low confidence");
  assert.match(lowConfidence.rejectionReasons.join(" "), /Confidence/i);

  const lowRr = suite.evaluateApprovedSetupProfile(baseSignal({ rrEstimate: 1.4 }), strict);
  assert.equal(lowRr.status, "rejected_candidate", "strict should reject RR below 2.0");
  assert.match(lowRr.rejectionReasons.join(" "), /RR/i);

  const missingHtf = suite.evaluateApprovedSetupProfile(baseSignal({ htfTimeframes: [], bias: { primary: "bullish", htf: {}, composite: "bullish" } }), strict);
  assert.equal(missingHtf.status, "rejected_candidate", "strict should reject missing HTF context");
  assert.match(missingHtf.rejectionReasons.join(" "), /higher-timeframe/i);

  const equilibrium = suite.evaluateApprovedSetupProfile(
    baseSignal({ dealingRange: { ...baseSignal().dealingRange, currentLocation: "equilibrium" } }),
    strict
  );
  assert.equal(equilibrium.status, "rejected_candidate", "strict should reject equilibrium");
  assert.match(equilibrium.rejectionReasons.join(" "), /equilibrium/i);

  const balancedAllowsRr = suite.evaluateApprovedSetupProfile(baseSignal({ rrEstimate: 1.8 }), balanced);
  assert.equal(balancedAllowsRr.status, "approved_research_candidate", "balanced should allow 1.8R");

  const experimentalLowConfidence = suite.evaluateApprovedSetupProfile(baseSignal({ confidence: 0.52, rrEstimate: 1.6 }), experimental);
  assert.equal(experimentalLowConfidence.status, "approved_research_candidate", "experimental should allow lower confidence when safety evidence exists");

  const experimentalNoDisplacement = suite.evaluateApprovedSetupProfile(baseSignal({ displacement: undefined }), experimental);
  assert.equal(experimentalNoDisplacement.status, "rejected_candidate", "experimental should still reject no displacement");
  assert.match(experimentalNoDisplacement.rejectionReasons.join(" "), /displacement/i);

  const experimentalNoSweep = suite.evaluateApprovedSetupProfile(baseSignal({ liquiditySwept: undefined }), experimental);
  assert.equal(experimentalNoSweep.status, "rejected_candidate", "experimental should still reject no liquidity sweep");
  assert.match(experimentalNoSweep.rejectionReasons.join(" "), /sweep/i);

  const noTrade = suite.evaluateApprovedSetupProfile(
    baseSignal({ decision: "no_trade", side: "flat", setup: "no_trade", confidence: 0.2, noTradeReasons: ["Fixture no-trade."] }),
    strict
  );
  assert.equal(noTrade.status, "no_trade", "no-trade input should stay no_trade");

  const watchlist = suite.evaluateApprovedSetupProfile(baseSignal({ confidence: 0.68 }), strict);
  assert.equal(watchlist.status, "watchlist_candidate", "near confidence miss should produce watchlist");
  assert.match(watchlist.watchlistReasons.join(" "), /Confidence/i);

  const unsafe = suite.evaluateApprovedSetupProfile(
    {
      ...baseSignal(),
      candles: [{ open: 1 }],
      accountData: { id: "forbidden" },
      orderData: { side: "long" },
      positionData: { size: 1 },
      secret: "forbidden"
    },
    strict
  );
  assert.equal(unsafe.status, "rejected_candidate", "unsafe fields should be rejected");
  assert.equal(suite.assertIctApprovedSetupDecisionIsCompact(unsafe).ok, true);
  const { safety: _unsafeSafety, ...unsafePayload } = unsafe;
  assert.doesNotMatch(JSON.stringify(unsafePayload), /"candles"\s*:/i, "decision must not include raw candles");
  assert.doesNotMatch(JSON.stringify(unsafePayload), /secret|accountData|orderData|positionData/i, "decision must not include unsafe fields");

  const replayResults = [
    {
      strategyId: "ict-fvg-displacement",
      symbol: "MNQ",
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      primaryTimeframe: "5m",
      side: "long",
      setup: "fvg_retracement",
      decision: "research_only",
      confidence: 0.78,
      htfAligned: true,
      dealingRangeLocation: "discount",
      liquidityTargetType: "previous_day_high",
      rrEstimate: 2.4,
      outcome: "target_first",
      fvgStatus: "respected",
      tradePath: { signalTime: "2026-06-05T13:00:00.000Z", rrAchieved: 2.4 },
      noTradeReasons: [],
      riskNotes: [],
      summary: "fixture",
      researchOnly: true,
      provenance: {
        methodology: "ICT",
        sourceSet: "ICT Mentorship Core Content",
        replay: true,
        researchOnly: true,
        generatedAt: "2026-06-05T13:00:00.000Z"
      }
    },
    {
      strategyId: "ict-daily-range",
      symbol: "MNQ",
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      primaryTimeframe: "5m",
      side: "short",
      setup: "daily_range_projection",
      decision: "research_only",
      confidence: 0.4,
      htfAligned: false,
      dealingRangeLocation: "equilibrium",
      liquidityTargetType: "session_low",
      rrEstimate: 0.8,
      outcome: "invalidation_first",
      fvgStatus: "not_applicable",
      tradePath: { signalTime: "2026-06-05T13:15:00.000Z", rrAchieved: -1 },
      noTradeReasons: [],
      riskNotes: [],
      summary: "fixture",
      researchOnly: true,
      provenance: {
        methodology: "ICT",
        sourceSet: "ICT Mentorship Core Content",
        replay: true,
        researchOnly: true,
        generatedAt: "2026-06-05T13:15:00.000Z"
      }
    }
  ];
  const summaries = suite.buildApprovedSetupProfileRunSummaries(replayResults, [strict]);
  assert.equal(summaries[0].profileId, "gotrader_ict_phase1_strict");
  assert.equal(summaries[0].totalSignalsBefore, 2);
  assert.equal(summaries[0].totalApproved, 1);
  assert.equal(summaries[0].totalRejected, 1);
  assert.equal(summaries[0].approvedTargetFirstRate, 1);
  const journalEvent = suite.buildIctApprovedSetupProfileJournalEvent({ profileSummary: summaries[0], runId: "test_run" });
  assert.equal(journalEvent.eventType, "ict_approved_setup_profile_summary");
  assert.equal(journalEvent.researchOnly, true);
  assert.equal(journalEvent.authority.executionAuthority, "none");
  assert.equal(journalEvent.safety.rawCandlesExcluded, true);
  assert.doesNotMatch(JSON.stringify(journalEvent), /"candles"\s*:/i);

  process.stdout.write("GoTrader ICT Approved Setup Profile smoke test passed.\n");
  process.stdout.write(`Strict approval status: ${approved.status}\n`);
  process.stdout.write(`Strict watchlist status: ${watchlist.status}\n`);
  process.stdout.write(`Replay approved count: ${summaries[0].totalApproved}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT Approved Setup Profile smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
