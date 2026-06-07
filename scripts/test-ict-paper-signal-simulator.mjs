#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-paper-signal-simulator-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictPaperSignalSimulatorTypes.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulator.ts" }
];

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

const signalFixture = (overrides = {}) => ({
  signalId: "ict_research_signal_fixture",
  generatedAt: "2026-06-05T18:00:00.000Z",
  researchOnly: true,
  status: "approved_research_signal",
  executionReadiness: "research_only",
  executionAllowed: false,
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  displayLabel: "USTECH -> MNQ",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  setup: "ict-bread-and-butter-buy",
  phase: "phase_2",
  side: "long",
  entryZone: {
    low: 100,
    high: 102,
    midpoint: 101,
    type: "compact_current_read_entry_zone"
  },
  invalidation: 96,
  target: 111,
  rrEstimate: 2.5,
  confidence: 0.72,
  approvedProfileStatus: "approved_research_candidate",
  modelQualityLane: "approved",
  paperWatchlistEligible: false,
  paperWatchlistReason: "Approved research lane; replay, evidence, maturity, and readiness gates still apply.",
  paperWatchlistEvidenceSummary: "Approved lane; compact evidence only; authority none.",
  approvalScore: 82,
  bias: "bullish",
  smtStatus: "confirms_candidate",
  newsSessionRisk: "allow",
  riskGovernorAction: "allow",
  monteCarlo: {
    robustnessRating: "strong",
    riskOfRuinPct: 2.4,
    recommendedMaxRiskPerTradePct: 0.35,
    usableOutcomes: 40
  },
  reasons: ["Current read passed the approved-profile research gate."],
  rejectionReasons: [],
  warnings: [
    "MT5 read-only USTECH is CFD/proxy research data, not CME futures truth.",
    "Execution is disabled; this signal contract is research-only."
  ],
  nextAction: "Run replay and walk-forward before readiness review.",
  authority,
  safety,
  provenance: {
    source: "ict_current_read",
    methodology: "ICT",
    researchOnly: true,
    generatedAt: "2026-06-05T18:00:00.000Z"
  },
  ...overrides
});

function assertSafePaperSignal(paperSignal, suite) {
  assert.equal(paperSignal.researchOnly, true);
  assert.equal(paperSignal.paperOnly, true);
  assert.equal(paperSignal.authority.executionAuthority, "none");
  assert.equal(paperSignal.authority.brokerAuthority, "none");
  assert.equal(paperSignal.authority.readinessOverrideAuthority, "none");
  assert.equal(paperSignal.safety.realOrderPlaced, false);
  assert.equal(paperSignal.safety.brokerMutation, false);
  assert.equal(paperSignal.safety.rawCandlesExcluded, true);
  assert.equal(paperSignal.safety.rawSnapshotsExcluded, true);
  assert.equal(paperSignal.safety.accountDataExcluded, true);
  assert.equal(paperSignal.safety.orderDataExcluded, true);
  assert.equal(paperSignal.safety.positionDataExcluded, true);
  assert.equal(paperSignal.safety.secretsExcluded, true);
  assert.equal(suite.assertIctPaperSignalIsSafe(paperSignal).ok, true);
  assert.doesNotMatch(
    JSON.stringify(paperSignal),
    /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i
  );
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictPaperSignalSimulator.mjs")));

  const approvedSignal = signalFixture();
  const approvedEligibility = suite.isResearchSignalEligibleForPaperSim(approvedSignal);
  assert.equal(approvedEligibility.eligible, true);

  const watchlist = signalFixture({ status: "watchlist_signal" });
  assert.equal(suite.isResearchSignalEligibleForPaperSim(watchlist).eligible, false);
  assert.equal(suite.isResearchSignalEligibleForPaperSim(watchlist, { allowWatchlist: true }).eligible, false);
  assert.match(suite.isResearchSignalEligibleForPaperSim(watchlist).reasons.join(" "), /Watchlist only - not paper eligible/i);
  const paperWatchlist = signalFixture({
    signalId: "ict_research_signal_paper_watchlist_fixture",
    status: "watchlist_signal",
    approvedProfileStatus: "paper_watchlist_candidate",
    modelQualityLane: "paper_watchlist",
    paperWatchlistEligible: true,
    paperWatchlistReason: "CMD paper-watchlist - paper-test only.",
    paperWatchlistEvidenceSummary: "CMD paper-watchlist evidence; compact only; authority none."
  });
  const paperWatchlistEligibility = suite.isResearchSignalEligibleForPaperSim(paperWatchlist);
  assert.equal(paperWatchlistEligibility.eligible, true);
  assert.match(paperWatchlistEligibility.warnings.join(" "), /Paper-only eligible|Paper-watchlist/i);

  assert.equal(suite.isResearchSignalEligibleForPaperSim(signalFixture({ status: "rejected_signal" })).eligible, false);
  assert.equal(suite.isResearchSignalEligibleForPaperSim(signalFixture({ status: "no_signal", side: "flat" })).eligible, false);
  assert.equal(suite.isResearchSignalEligibleForPaperSim(signalFixture({ target: undefined })).eligible, false);
  assert.equal(suite.isResearchSignalEligibleForPaperSim(signalFixture({ invalidation: undefined })).eligible, false);
  assert.equal(suite.isResearchSignalEligibleForPaperSim(signalFixture({ entryZone: undefined })).eligible, false);

  const longPaper = suite.createPaperSignalFromResearchSignal(approvedSignal, { generatedAt: "2026-06-05T18:10:00.000Z" });
  assert.equal(longPaper.status, "paper_open");
  assert.equal(longPaper.outcome, "open");
  assert.equal(longPaper.simulatedEntry.price, 101);
  assertSafePaperSignal(longPaper, suite);
  assert.equal(
    suite.createPaperSignalFromResearchSignal(paperWatchlist, { generatedAt: "2026-06-05T18:10:00.000Z" }).status,
    "paper_open",
    "paper-watchlist candidates should be simulation eligible"
  );
  assert.match(
    suite.createPaperSignalFromResearchSignal(paperWatchlist, { generatedAt: "2026-06-05T18:10:00.000Z" }).notes.join(" "),
    /Paper-only eligible/i
  );

  const longTarget = suite.simulatePaperSignalOutcome(longPaper, [{ at: "2026-06-05T18:15:00.000Z", price: 112 }]);
  assert.equal(longTarget.status, "paper_target_hit");
  assert.equal(longTarget.outcome, "target_hit");
  assertSafePaperSignal(longTarget, suite);

  const longInvalidation = suite.simulatePaperSignalOutcome(longPaper, [{ at: "2026-06-05T18:15:00.000Z", price: 95 }]);
  assert.equal(longInvalidation.status, "paper_invalidation_hit");
  assert.equal(longInvalidation.outcome, "invalidation_hit");
  assertSafePaperSignal(longInvalidation, suite);

  const shortPaper = suite.createPaperSignalFromResearchSignal(
    signalFixture({
      signalId: "ict_research_signal_short_fixture",
      side: "short",
      bias: "bearish",
      entryZone: { low: 99, high: 101, midpoint: 100, type: "compact_current_read_entry_zone" },
      target: 90,
      invalidation: 105,
      rrEstimate: 2
    })
  );
  assert.equal(shortPaper.status, "paper_open");
  const shortTarget = suite.simulatePaperSignalOutcome(shortPaper, [{ at: "2026-06-05T18:15:00.000Z", price: 89 }]);
  assert.equal(shortTarget.status, "paper_target_hit");
  assert.equal(shortTarget.outcome, "target_hit");
  const shortInvalidation = suite.simulatePaperSignalOutcome(shortPaper, [{ at: "2026-06-05T18:15:00.000Z", price: 106 }]);
  assert.equal(shortInvalidation.status, "paper_invalidation_hit");
  assert.equal(shortInvalidation.outcome, "invalidation_hit");

  const expired = suite.simulatePaperSignalOutcome(longPaper, [
    { at: "2026-06-05T18:15:00.000Z", price: 103 },
    { at: "2026-06-05T18:20:00.000Z", price: 104 }
  ]);
  assert.equal(expired.status, "paper_expired");
  assert.equal(expired.outcome, "expired");

  const cancelled = suite.cancelPaperSignal(longPaper, "Cancelled during smoke test.");
  assert.equal(cancelled.status, "paper_cancelled");
  assert.equal(cancelled.outcome, "cancelled");

  const journalEvent = suite.buildIctPaperSignalJournalEvent(longPaper, "ict_paper_signal_created");
  assert.equal(journalEvent.eventType, "ict_paper_signal_created");
  assert.equal(journalEvent.paperOnly, true);
  assert.equal(journalEvent.realOrderPlaced, false);
  assert.equal(journalEvent.brokerMutation, false);
  assert.equal(journalEvent.authority.executionAuthority, "none");
  assert.equal(suite.assertIctPaperSignalIsSafe(longPaper, journalEvent).ok, true);
  const journalWrite = suite.appendIctPaperSignalJournalEvent(journalEvent);
  assert.equal(journalWrite.ok, true);

  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "IctAdvisorSummaryPanel.tsx"), "utf8");
  assert.match(advisorSource, /data-testid="ict-paper-signal-simulator"/, "Research Advisor should render the paper simulator");
  assert.match(advisorSource, /Create Paper Simulation/, "Research Advisor should expose the paper simulator action");
  assert.match(dashboardSource, /dashboard-ict-paper-sim-status/, "Dashboard compact advisor should expose paper sim status");
  assert.match(`${advisorSource}\n${dashboardSource}`, /Paper only|Paper Sim|broker mutation/i, "UI should label paper-only simulation");
  assert.doesNotMatch(`${advisorSource}\n${dashboardSource}`, /<Button[^>]*>\s*(Buy|Sell|Execute|Place Order|Buy Market|Sell Market|Enable Live Trading|Connect Live Broker)/i);

  process.stdout.write("GoTrader ICT Paper Signal Simulator smoke test passed.\n");
  process.stdout.write(`Approved eligibility: ${approvedEligibility.status}\n`);
  process.stdout.write(`Long target outcome: ${longTarget.status} / ${longTarget.outcome}\n`);
  process.stdout.write(`Short target outcome: ${shortTarget.status} / ${shortTarget.outcome}\n`);
  process.stdout.write(`Authority: ${longPaper.authority.executionAuthority}/${longPaper.authority.brokerAuthority}/${longPaper.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT paper signal simulator smoke test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
