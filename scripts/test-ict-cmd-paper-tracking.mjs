#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-cmd-paper-tracking-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictCmdPaperTrackingTypes.ts" },
  { root: sourceRoot, file: "ictCmdPaperTracking.ts" }
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
  signalId: "ict_cmd_signal_fixture",
  generatedAt: "2026-06-05T18:00:00.000Z",
  researchOnly: true,
  status: "watchlist_signal",
  executionReadiness: "research_only",
  executionAllowed: false,
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  displayLabel: "USTECH -> MNQ",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  setup: "cmd-strict-paper-watchlist",
  phase: "phase_2",
  side: "short",
  entryZone: {
    low: 99,
    high: 101,
    midpoint: 100,
    type: "compact_current_read_entry_zone"
  },
  invalidation: 105,
  target: 90,
  rrEstimate: 2,
  confidence: 0.68,
  approvedProfileStatus: "paper_watchlist_candidate",
  modelQualityLane: "paper_watchlist",
  paperWatchlistEligible: true,
  paperWatchlistReason: "CMD paper-watchlist - paper-test only.",
  paperWatchlistEvidenceSummary: "CMD strict evidence; compact only; authority none.",
  approvalScore: 72,
  bias: "bearish",
  smtStatus: "neutral",
  newsSessionRisk: "allow",
  riskGovernorAction: "allow",
  sessionNarrativeProfile: "consolidation_manipulation_distribution",
  sessionDirectionalRead: "bearish",
  sessionNarrativeConfidence: 0.74,
  modelDetected: true,
  modelName: "consolidation_manipulation_distribution",
  modelState: "confirmed",
  modelDirection: "bearish",
  modelConfidence: 0.74,
  modelReasons: ["CMD session model confirmed."],
  modelMissingEvidence: [],
  fvgTargetDirection: "discount",
  sessionNarrativeReasons: ["Consolidation, manipulation, distribution sequence detected."],
  dataDepthStatus: "sufficient",
  reasons: ["CMD paper-watchlist candidate meets strict paper lane."],
  rejectionReasons: [],
  warnings: [
    "MT5 read-only USTECH is CFD/proxy research data, not CME futures truth.",
    "Execution is disabled; this signal contract is research-only."
  ],
  nextAction: "Track CMD paper-only outcome against read-only candles.",
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

function assertSafeRecord(record, event, suite) {
  assert.equal(record.paperOnly, true);
  assert.equal(record.researchOnly, true);
  assert.equal(record.executionAllowed, false);
  assert.equal(record.authority.executionAuthority, "none");
  assert.equal(record.authority.brokerAuthority, "none");
  assert.equal(record.authority.readinessOverrideAuthority, "none");
  assert.equal(record.safety.realOrderPlaced, false);
  assert.equal(record.safety.brokerMutation, false);
  assert.equal(record.safety.rawCandlesExcluded, true);
  assert.equal(record.safety.rawSnapshotsExcluded, true);
  assert.equal(record.safety.accountDataExcluded, true);
  assert.equal(record.safety.orderDataExcluded, true);
  assert.equal(record.safety.positionDataExcluded, true);
  assert.equal(record.safety.secretsExcluded, true);
  assert.equal(suite.assertIctCmdPaperTrackingIsSafe(record, event).ok, true);
  assert.doesNotMatch(
    JSON.stringify({ record, event }),
    /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i
  );
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictCmdPaperTracking.mjs")));

  const cmdSignal = signalFixture();
  const cmdEligibility = suite.evaluateCmdPaperTrackingEligibility(cmdSignal);
  assert.equal(cmdEligibility.eligible, true, "CMD paper-watchlist should be eligible");
  assert.equal(suite.isCmdPaperWatchlistSignal(cmdSignal), true);

  const createResult = suite.createCmdPaperTrackingFromResearchSignal(cmdSignal, { generatedAt: "2026-06-05T18:10:00.000Z" });
  assert.equal(createResult.ok, true, "CMD paper-watchlist should create a tracking record");
  assert.equal(createResult.record.sourceModel, "consolidation_manipulation_distribution");
  assert.equal(createResult.record.state, "active");
  assert.equal(createResult.record.outcome, "open");
  assert.equal(createResult.record.paperOnly, true);
  assert.equal(createResult.record.executionAllowed, false);
  assert.equal(createResult.journalEvent.eventType, "ict_cmd_paper_tracking_created");
  assertSafeRecord(createResult.record, createResult.journalEvent, suite);

  const ameWatchlist = signalFixture({
    signalId: "ict_ame_watchlist_fixture",
    approvedProfileStatus: "watchlist_candidate",
    modelQualityLane: "watchlist",
    paperWatchlistEligible: false,
    modelName: "accumulation_manipulation_expansion",
    paperWatchlistReason: "AME watchlist only - not paper-ready."
  });
  assert.equal(suite.evaluateCmdPaperTrackingEligibility(ameWatchlist).eligible, false, "AME watchlist must not create CMD tracking");
  assert.equal(suite.createCmdPaperTrackingFromResearchSignal(ameWatchlist).ok, false);

  const rejected = signalFixture({
    signalId: "ict_rejected_fixture",
    status: "rejected_signal",
    approvedProfileStatus: "rejected_candidate",
    modelQualityLane: "rejected",
    paperWatchlistEligible: false
  });
  assert.equal(suite.createCmdPaperTrackingFromResearchSignal(rejected).ok, false, "rejected candidates must not create tracking");

  const noTrade = signalFixture({
    signalId: "ict_no_trade_fixture",
    status: "no_signal",
    side: "flat",
    approvedProfileStatus: "no_trade",
    modelQualityLane: "no_trade",
    paperWatchlistEligible: false
  });
  assert.equal(suite.createCmdPaperTrackingFromResearchSignal(noTrade).ok, false, "no-trade candidates must not create tracking");

  const shortTarget = suite.updateCmdPaperTrackingWithCandles(createResult.record, [
    { timestamp: "2026-06-05T18:15:00.000Z", high: 100, low: 89, close: 91 }
  ]);
  assert.equal(shortTarget.record.state, "target_hit");
  assert.equal(shortTarget.record.outcome, "target_hit");
  assert.equal(shortTarget.journalEvent.eventType, "ict_cmd_paper_tracking_updated");
  assertSafeRecord(shortTarget.record, shortTarget.journalEvent, suite);

  const shortInvalidationBase = suite.createCmdPaperTrackingFromResearchSignal(cmdSignal, { generatedAt: "2026-06-05T18:10:00.000Z" }).record;
  const shortInvalidation = suite.updateCmdPaperTrackingWithCandles(shortInvalidationBase, [
    { timestamp: "2026-06-05T18:15:00.000Z", high: 106, low: 96, close: 104 }
  ]);
  assert.equal(shortInvalidation.record.state, "invalidation_hit");
  assert.equal(shortInvalidation.record.outcome, "invalidation_hit");
  assertSafeRecord(shortInvalidation.record, shortInvalidation.journalEvent, suite);

  const longSignal = signalFixture({
    signalId: "ict_cmd_long_fixture",
    side: "long",
    bias: "bullish",
    invalidation: 95,
    target: 111,
    modelDirection: "bullish",
    sessionDirectionalRead: "bullish"
  });
  const longRecord = suite.createCmdPaperTrackingFromResearchSignal(longSignal, { generatedAt: "2026-06-05T18:10:00.000Z" }).record;
  assert.equal(
    suite.updateCmdPaperTrackingWithCandles(longRecord, [{ timestamp: "2026-06-05T18:20:00.000Z", high: 112, low: 100, close: 111 }]).record.state,
    "target_hit"
  );
  assert.equal(
    suite.updateCmdPaperTrackingWithCandles(longRecord, [{ timestamp: "2026-06-05T18:20:00.000Z", high: 100, low: 94, close: 95 }]).record.state,
    "invalidation_hit"
  );

  const stillActive = suite.updateCmdPaperTrackingWithCandles(createResult.record, [
    { timestamp: "2026-06-05T18:15:00.000Z", high: 101, low: 95, close: 99 }
  ]);
  assert.equal(stillActive.record.state, "active");
  assert.equal(stillActive.reason, "still_active");

  assert.equal(suite.appendIctCmdPaperTrackingJournalEvent(createResult.journalEvent).ok, true);
  assert.equal(suite.saveActiveCmdPaperTracking(createResult.record).ok, true);
  assert.equal(suite.readActiveCmdPaperTracking().trackingId, createResult.record.trackingId);

  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "IctAdvisorSummaryPanel.tsx"), "utf8");
  assert.match(advisorSource, /Track CMD Paper Candidate/, "Research Advisor should expose CMD paper tracking action");
  assert.match(advisorSource, /data-testid="ict-cmd-paper-tracking-card"/, "Research Advisor should render CMD paper tracking card");
  assert.match(dashboardSource, /data-testid="dashboard-ict-cmd-paper-status"/, "Dashboard compact advisor should show CMD paper status");
  assert.doesNotMatch(`${advisorSource}\n${dashboardSource}`, /<Button[^>]*>\s*(Buy|Sell|Execute|Place Order|Buy Market|Sell Market|Enable Live Trading|Connect Live Broker)/i);

  process.stdout.write("GoTrader ICT CMD Paper Tracking smoke test passed.\n");
  process.stdout.write(`CMD eligibility: ${cmdEligibility.status}\n`);
  process.stdout.write(`Target outcome: ${shortTarget.record.state}\n`);
  process.stdout.write(`Invalidation outcome: ${shortInvalidation.record.state}\n`);
  process.stdout.write("Authority: none/none/none; paperOnly true; executionAllowed false.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
