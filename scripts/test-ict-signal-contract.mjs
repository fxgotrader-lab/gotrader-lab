#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-signal-contract-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictSignalContractTypes.ts" },
  { root: sourceRoot, file: "ictSignalContract.ts" }
];

function compileForNode() {
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
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
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

const currentReadFixture = (overrides = {}) => ({
  researchOnly: true,
  packetSource: "live_mt5",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  dataStatus: "ready",
  candleCount: 1000,
  htfStatus: { "15m": "ready", "1h": "ready" },
  bestPhase1Setup: "fvg_retracement",
  bestPhase2Setup: "ict-bread-and-butter-buy",
  bestSetup: "ict-bread-and-butter-buy",
  side: "long",
  approvedStatus: "approved_research_candidate",
  modelQualityLane: "approved",
  paperWatchlistEligible: false,
  paperWatchlistReason: "Approved research lane; replay, evidence, maturity, and readiness gates still apply.",
  paperWatchlistEvidenceSummary: "CMD / valid / bullish. Lane approved; RR 2.30R; confidence 74%; authority none.",
  executionAllowed: false,
  approvalScore: 82,
  confidence: 0.74,
  rrEstimate: 2.3,
  target: 30625.5,
  invalidation: 30490.25,
  bias: "bullish",
  smtStatus: "confirms_candidate",
  riskStatus: "allow",
  dealingRangeLocation: "discount",
  drawOnLiquidity: "previous_day_high @ 30625.5",
  liquiditySwept: "previous_day_low @ 30480.25",
  fvgStatus: "bullish_present",
  displacementStatus: "bullish_with_fvg",
  entryZone: "30510.25-30528.75",
  sessionNarrativeProfile: "ny_session_reversal_to_premium_fvg",
  sessionDirectionalRead: "bullish",
  sessionNarrativeConfidence: 0.84,
  fvgTargetDetected: true,
  fvgTargetDirection: "premium",
  dataDepthStatus: "limited",
  sessionTopReasons: ["NY reversal higher toward premium FVG."],
  topReasons: ["Current read passed the approved-profile research gate."],
  nextAction: "Run replay and walk-forward before readiness review.",
  debug: {
    candleCount: 1000,
    primaryTimeframeAvailable: true,
    htfTimeframesAvailable: ["15m", "1h"],
    phase1SignalCount: 4,
    phase2SignalCount: 4,
    approvedStatus: "approved_research_candidate",
    rejectionReasonsCount: 0,
    noTradeReasonsCount: 0,
    lastEvaluationAt: "2026-06-05T18:00:00.000Z",
    packetSource: "live_mt5",
    sourceFingerprint: "signal_contract_fixture_fp",
    journalStatus: "memory_only"
  },
  authority,
  safety,
  ...overrides
});

const latestStateFixture = (robustnessRating = "strong") => ({
  updatedAt: "2026-06-05T18:05:00.000Z",
  researchOnly: true,
  latestMonteCarlo: {
    generatedAt: "2026-06-05T18:05:00.000Z",
    source: "manual_replay_review",
    usableOutcomes: 40,
    robustnessRating,
    medianEndingR: 7.4,
    fifthPercentileEndingR: 1.2,
    medianMaxDrawdownPct: 2.1,
    worstMaxDrawdownPct: 6.3,
    riskOfRuinPct: robustnessRating === "insufficient_data" ? 18 : 2.4,
    recommendedMaxRiskPerTradePct: robustnessRating === "insufficient_data" ? 0.1 : 0.35,
    warnings: robustnessRating === "insufficient_data" ? ["Too few usable outcomes."] : [],
    researchOnly: true
  },
  authority,
  safety
});

function assertSafeSignal(signal, suite) {
  assert.equal(signal.researchOnly, true);
  assert.equal(signal.executionReadiness, "research_only");
  assert.equal(signal.executionAllowed, false);
  assert.equal(signal.modelQualityLane, signal.approvedProfileStatus === "paper_watchlist_candidate" ? "paper_watchlist" : signal.modelQualityLane);
  assert.equal(signal.paperWatchlistEligible, signal.approvedProfileStatus === "paper_watchlist_candidate");
  assert.equal(signal.authority.executionAuthority, "none");
  assert.equal(signal.authority.brokerAuthority, "none");
  assert.equal(signal.authority.readinessOverrideAuthority, "none");
  assert.equal(signal.safety.rawCandlesExcluded, true);
  assert.equal(signal.safety.rawSnapshotsExcluded, true);
  assert.equal(signal.safety.accountDataExcluded, true);
  assert.equal(signal.safety.orderDataExcluded, true);
  assert.equal(signal.safety.positionDataExcluded, true);
  assert.equal(signal.safety.secretsExcluded, true);
  assert.equal(suite.assertIctResearchSignalIsCompact(signal).ok, true);
  assert.doesNotMatch(
    JSON.stringify(signal),
    /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i
  );
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictSignalContract.mjs")));

  const approved = suite.buildIctResearchSignalFromCurrentRead(currentReadFixture(), latestStateFixture("strong"));
  assert.equal(approved.status, "approved_research_signal");
  assert.equal(approved.side, "long");
  assert.equal(approved.entryZone.low, 30510.25);
  assert.equal(approved.entryZone.high, 30528.75);
  assert.equal(approved.monteCarlo.robustnessRating, "strong");
  assert.equal(approved.monteCarlo.riskOfRuinPct, 2.4);
  assert.equal(approved.monteCarlo.recommendedMaxRiskPerTradePct, 0.35);
  assert.equal(approved.sessionNarrativeProfile, "ny_session_reversal_to_premium_fvg");
  assert.equal(approved.sessionDirectionalRead, "bullish");
  assert.equal(approved.fvgTargetDirection, "premium");
  assert.deepEqual(approved.sessionNarrativeReasons, ["NY reversal higher toward premium FVG."]);
  assert.equal(approved.dataDepthStatus, "limited");
  assert.equal(suite.validateResearchSignalCompleteness(approved).ok, true);
  assertSafeSignal(approved, suite);

  const watchlist = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({
      approvedStatus: "watchlist_candidate",
      modelQualityLane: "watchlist",
      paperWatchlistEligible: false,
      paperWatchlistReason: "AME watchlist only - not paper-ready.",
      approvalScore: 66,
      topReasons: ["Confidence is near but below the approved profile threshold."]
    }),
    latestStateFixture("moderate")
  );
  assert.equal(watchlist.status, "watchlist_signal");
  assert.equal(watchlist.modelQualityLane, "watchlist");
  assert.equal(watchlist.paperWatchlistEligible, false);
  assert.ok(watchlist.reasons.some((reason) => /watchlist only|not paper/i.test(reason)));
  assertSafeSignal(watchlist, suite);

  const paperWatchlist = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({
      approvedStatus: "paper_watchlist_candidate",
      modelQualityLane: "paper_watchlist",
      paperWatchlistEligible: true,
      paperWatchlistModelName: "consolidation_manipulation_distribution",
      paperWatchlistReason: "CMD paper-watchlist - paper-test only.",
      paperWatchlistEvidenceSummary: "CMD / detected / bearish. Lane paper watchlist; RR 2.10R; confidence 69%; authority none.",
      approvalScore: 69,
      topReasons: ["Complete structure is present, but one approval gate remains watchlist-only."]
    }),
    latestStateFixture("moderate")
  );
  assert.equal(paperWatchlist.status, "watchlist_signal");
  assert.equal(paperWatchlist.approvedProfileStatus, "paper_watchlist_candidate");
  assert.equal(paperWatchlist.modelQualityLane, "paper_watchlist");
  assert.equal(paperWatchlist.paperWatchlistEligible, true);
  assert.ok(paperWatchlist.reasons.some((reason) => /paper-watchlist|paper-test/i.test(reason)));
  assertSafeSignal(paperWatchlist, suite);

  const rejected = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({
      approvedStatus: "rejected_candidate",
      modelQualityLane: "rejected",
      paperWatchlistEligible: false,
      paperWatchlistReason: "Approved-profile layer rejected the current read.",
      approvalScore: 41,
      riskStatus: "allow",
      topReasons: ["Approved-profile layer rejected the current read."]
    }),
    latestStateFixture("strong")
  );
  assert.equal(rejected.status, "rejected_signal");
  assert.ok(rejected.rejectionReasons.some((reason) => /rejected/i.test(reason)));
  assertSafeSignal(rejected, suite);

  const noSignal = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({
      approvedStatus: "no_trade",
      modelQualityLane: "no_trade",
      paperWatchlistEligible: false,
      paperWatchlistReason: "No active model-quality lane.",
      side: "flat",
      target: undefined,
      invalidation: undefined,
      rrEstimate: undefined,
      confidence: undefined,
      topReasons: ["No-trade current read."]
    }),
    latestStateFixture("strong")
  );
  assert.equal(noSignal.status, "no_signal");
  assertSafeSignal(noSignal, suite);

  const missingTarget = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({ target: undefined }),
    latestStateFixture("strong")
  );
  assert.equal(missingTarget.status, "rejected_signal");
  assert.ok(missingTarget.rejectionReasons.some((reason) => /Missing target/i.test(reason)));

  const missingInvalidation = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({ invalidation: undefined }),
    latestStateFixture("strong")
  );
  assert.equal(missingInvalidation.status, "rejected_signal");
  assert.ok(missingInvalidation.rejectionReasons.some((reason) => /Missing invalidation/i.test(reason)));

  const riskBlocked = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({ riskStatus: "reject_candidate" }),
    latestStateFixture("strong")
  );
  assert.equal(riskBlocked.status, "rejected_signal");
  assert.ok(riskBlocked.rejectionReasons.some((reason) => /Risk governor blocks/i.test(reason)));

  const smtBlocked = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture({ smtStatus: "rejects_candidate" }),
    latestStateFixture("strong")
  );
  assert.equal(smtBlocked.status, "rejected_signal");
  assert.ok(smtBlocked.rejectionReasons.some((reason) => /SMT\/relative strength rejects/i.test(reason)));

  const insufficientMonteCarlo = suite.buildIctResearchSignalFromCurrentRead(
    currentReadFixture(),
    latestStateFixture("insufficient_data")
  );
  assert.equal(insufficientMonteCarlo.status, "approved_research_signal", "Monte Carlo cannot approve, but it also should not override an otherwise complete deterministic signal");
  assert.ok(insufficientMonteCarlo.warnings.some((warning) => /insufficient_data/i.test(warning)));
  assert.equal(insufficientMonteCarlo.monteCarlo.robustnessRating, "insufficient_data");

  const journalEvent = suite.buildIctResearchSignalJournalEvent(approved);
  assert.equal(journalEvent.eventType, "ict_research_signal_generated");
  assert.equal(journalEvent.executionAllowed, false);
  assert.equal(journalEvent.researchOnly, true);
  assert.equal(journalEvent.authority.executionAuthority, "none");
  assert.equal(suite.assertIctResearchSignalIsCompact(approved, journalEvent).ok, true);
  const journalWrite = suite.appendIctResearchSignalJournalEvent(journalEvent);
  assert.equal(journalWrite.ok, true);

  const dashboardSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "IctAdvisorSummaryPanel.tsx"), "utf8");
  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  assert.match(advisorSource, /data-testid="ict-research-signal-card"/, "Research Advisor should render the signal card");
  assert.match(advisorSource, /appendIctResearchSignalJournalEvent/, "Research Advisor should journal compact signal events");
  assert.match(dashboardSource, /dashboard-ict-research-signal-status/, "Dashboard compact advisor should expose signal status");
  assert.match(`${dashboardSource}\n${advisorSource}`, /Execution Disabled|execution disabled/i, "UI should label execution disabled");
  assert.doesNotMatch(`${dashboardSource}\n${advisorSource}`, /<Button[^>]*>\s*(Buy|Sell|Execute|Place Order|Buy Market|Sell Market|Enable Live Trading|Connect Live Broker)/i);

  process.stdout.write("GoTrader ICT Signal Contract smoke test passed.\n");
  process.stdout.write(`Approved signal: ${approved.status} / ${approved.side} / ${approved.rrEstimate}R\n`);
  process.stdout.write(`Monte Carlo: ${approved.monteCarlo.robustnessRating} / risk of ruin ${approved.monteCarlo.riskOfRuinPct}%\n`);
  process.stdout.write(`Authority: ${approved.authority.executionAuthority}/${approved.authority.brokerAuthority}/${approved.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT signal contract smoke test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
