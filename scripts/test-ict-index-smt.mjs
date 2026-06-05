#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-index-smt-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
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
  return globalThis.__ICT_INDEX_SMT_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_INDEX_SMT_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const candle = (id, timestamp, open, high, low, close, symbol = "MNQ") => ({
  id,
  symbol,
  timeframe: "5m",
  timestamp,
  open,
  high,
  low,
  close,
  volume: 1000
});

const makeSeries = ({ base = 100, brokerSymbol = "USTECH", direction = "up", sweep = "none" }) => {
  const previous = Array.from({ length: 6 }, (_, index) => {
    const open = base + index * 0.25;
    return candle(`${brokerSymbol}_p_${index}`, `2026-06-05T12:${String(index * 5).padStart(2, "0")}:00.000Z`, open, base + 4, base - 2, open + 0.2, brokerSymbol);
  });
  const recent = Array.from({ length: 6 }, (_, index) => {
    const trend = direction === "down" ? -index * 0.65 : index * 0.65;
    const open = base + 1 + trend;
    const high = sweep === "buy" && index === 1 ? base + 6 : base + 3 + Math.max(trend, 0);
    const low = sweep === "sell" && index === 1 ? base - 4 : base - 1 + Math.min(trend, 0);
    return candle(`${brokerSymbol}_r_${index}`, `2026-06-05T12:${String((index + 6) * 5).padStart(2, "0")}:00.000Z`, open, high, low, open + (direction === "down" ? -0.3 : 0.3), brokerSymbol);
  });
  return [...previous, ...recent];
};

const bullishComparison = () => ({
  USTECH: makeSeries({ base: 100, brokerSymbol: "USTECH", direction: "up", sweep: "sell" }),
  US500: makeSeries({ base: 50, brokerSymbol: "US500", direction: "up", sweep: "none" }),
  US30: makeSeries({ base: 200, brokerSymbol: "US30", direction: "up", sweep: "none" })
});

const bearishComparison = () => ({
  USTECH: makeSeries({ base: 100, brokerSymbol: "USTECH", direction: "down", sweep: "buy" }),
  US500: makeSeries({ base: 50, brokerSymbol: "US500", direction: "down", sweep: "none" }),
  US30: makeSeries({ base: 200, brokerSymbol: "US30", direction: "down", sweep: "none" })
});

const allConfirmSellSide = () => ({
  USTECH: makeSeries({ base: 100, brokerSymbol: "USTECH", direction: "up", sweep: "sell" }),
  US500: makeSeries({ base: 50, brokerSymbol: "US500", direction: "up", sweep: "sell" }),
  US30: makeSeries({ base: 200, brokerSymbol: "US30", direction: "up", sweep: "sell" })
});

const baseSignal = (smt, overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  phase: "phase_1",
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
    htf: { "15m": "bullish", "1h": "bullish" },
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
  entryZone: { type: "fair_value_gap", high: 101, low: 99, midpoint: 100 },
  invalidation: 96,
  target: 112,
  rrEstimate: 2.4,
  setup: "fvg_retracement",
  summary: "SMT fixture signal.",
  noTradeReasons: [],
  riskNotes: ["Research only."],
  smt,
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-05T13:00:00.000Z"
  },
  ...overrides
});

function assertCompact(value, label) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, `${label} must not expose raw candles`);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i, `${label} must not expose secrets/account/order/position/raw snapshots`);
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  const bullishLong = suite.evaluateIndexSmt({
    candidateSide: "long",
    candlesByBrokerSymbol: bullishComparison(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"]
  });
  assert.equal(bullishLong.divergenceType, "bullish_smt");
  assert.equal(bullishLong.confirmsCandidate, true);
  assert.equal(bullishLong.rejectsCandidate, false);
  assert.equal(bullishLong.researchOnly, true);
  assert.equal(bullishLong.authority.executionAuthority, "none");
  assert.equal(bullishLong.safety.rawCandlesExcluded, true);
  assert.ok(bullishLong.relativeStrengthLeader, "relative strength leader should be detected");
  assertCompact(bullishLong, "SMT signal");

  const bullishAgainstShort = suite.evaluateIndexSmt({
    candidateSide: "short",
    candlesByBrokerSymbol: bullishComparison(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m"
  });
  assert.equal(bullishAgainstShort.divergenceType, "bullish_smt");
  assert.equal(bullishAgainstShort.rejectsCandidate, true, "bullish SMT should reject short candidates");

  const bearishShort = suite.evaluateIndexSmt({
    candidateSide: "short",
    candlesByBrokerSymbol: bearishComparison(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m"
  });
  assert.equal(bearishShort.divergenceType, "bearish_smt");
  assert.equal(bearishShort.confirmsCandidate, true, "bearish SMT should confirm short candidates");

  const bearishAgainstLong = suite.evaluateIndexSmt({
    candidateSide: "long",
    candlesByBrokerSymbol: bearishComparison(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m"
  });
  assert.equal(bearishAgainstLong.divergenceType, "bearish_smt");
  assert.equal(bearishAgainstLong.rejectsCandidate, true, "bearish SMT should reject long candidates");

  const noSmt = suite.evaluateIndexSmt({
    candidateSide: "long",
    candlesByBrokerSymbol: allConfirmSellSide(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m"
  });
  assert.equal(noSmt.divergenceType, "no_smt", "all indexes confirming the same low should not produce SMT divergence");

  const insufficient = suite.evaluateIndexSmt({
    candidateSide: "long",
    candlesByBrokerSymbol: { USTECH: bullishComparison().USTECH },
    primarySymbol: "USTECH",
    primaryTimeframe: "5m"
  });
  assert.equal(insufficient.divergenceType, "insufficient_data");
  assert.equal(insufficient.confirmsCandidate, false);
  assert.equal(insufficient.rejectsCandidate, false);

  const strict = suite.getDefaultApprovedSetupProfiles()[0];
  const approvedWithSmt = suite.evaluateApprovedSetupProfile(baseSignal(bullishLong), strict);
  assert.equal(approvedWithSmt.smtDivergenceType, "bullish_smt");
  assert.equal(approvedWithSmt.smtConfirmsCandidate, true);
  assert.ok(approvedWithSmt.approvedReasons.some((reason) => /SMT\/relative strength confirms/i.test(reason)));
  assert.equal(suite.assertIctApprovedSetupDecisionIsCompact(approvedWithSmt).ok, true);

  const rejectedWithSmt = suite.evaluateApprovedSetupProfile(baseSignal(bearishAgainstLong), strict);
  assert.equal(rejectedWithSmt.status, "rejected_candidate");
  assert.equal(rejectedWithSmt.smtRejectsCandidate, true);
  assert.ok(rejectedWithSmt.rejectionReasons.some((reason) => /SMT\/relative strength rejects/i.test(reason)));

  const adjustedDecision = suite.applySmtToApprovedDecision(suite.evaluateApprovedSetupProfile(baseSignal(), strict), bullishLong);
  assert.equal(adjustedDecision.smtConfirmsCandidate, true);
  assert.ok(adjustedDecision.approvalScore >= approvedWithSmt.approvalScore - 5);

  const sourceSummary = {
    sourceId: "ict_index_smt:MNQ:USTECH:5m",
    provider: "mt5_read_only",
    symbol: "MNQ",
    normalizedSymbol: "MNQ",
    timeframe: "5m",
    candleCount: bullishComparison().USTECH.length,
    storageBackend: "memory",
    dataQuality: "sufficient",
    eligibility: { chartDisplay: true, quickAnalysis: true, researchCycle: true, walkForward: false },
    eligibilityReasons: [],
    warnings: [],
    provenance: { sourceLabel: "USTECH SMT fixture", providerSymbol: "USTECH", generatedAt: "2026-06-05T13:00:00.000Z" },
    authority: { executionAuthority: "none", brokerAuthority: "none", readinessOverrideAuthority: "none" },
    fingerprint: "ict_index_smt_fixture",
    roles: ["available", "research"]
  };
  const advisorSignals = suite.buildIctAdvisorSignals({
    brokerSymbol: "USTECH",
    candles: bullishComparison().USTECH,
    htfCandles: { "15m": bullishComparison().USTECH, "1h": bullishComparison().USTECH },
    indexComparisonCandles: bullishComparison(),
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    sourceSummary,
    symbol: "MNQ"
  });
  assert.ok(advisorSignals.length >= 8, "Advisor should still emit the existing ICT candidate set");
  assert.ok(advisorSignals.every((signal) => signal.smt?.researchOnly === true), "Every index advisor candidate should receive SMT metadata");
  assert.ok(advisorSignals.every((signal) => signal.htfTimeframes.includes("15m") && signal.htfTimeframes.includes("1h")), "Advisor should preserve primary + HTF context");
  assertCompact(advisorSignals, "Advisor signals");

  const missingHtfSignals = suite.buildIctAdvisorSignals({
    brokerSymbol: "USTECH",
    candles: bullishComparison().USTECH,
    htfCandles: {},
    indexComparisonCandles: bullishComparison(),
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    sourceSummary,
    symbol: "MNQ"
  });
  const htfSignal = missingHtfSignals.find((signal) => signal.strategyId === "ict-htf-bias");
  assert.equal(htfSignal?.decision, "no_trade", "missing HTF context should still force no_trade");
  assert.ok(htfSignal?.noTradeReasons.some((reason) => /Missing higher-timeframe/i.test(reason)), "missing HTF reason should stay visible");

  const diagnostics = suite.buildReplayDiagnostics([
    {
      ...baseSignal(bullishLong),
      outcome: "target_first",
      fvgStatus: "respected",
      htfAligned: true,
      liquidityTargetType: "previous_day_high",
      smtDivergenceType: bullishLong.divergenceType,
      smtConfirmsCandidate: bullishLong.confirmsCandidate,
      smtRejectsCandidate: bullishLong.rejectsCandidate,
      relativeStrengthLeader: bullishLong.relativeStrengthLeader,
      relativeWeaknessLeader: bullishLong.relativeWeaknessLeader,
      smtConfidenceAdjustment: bullishLong.confidenceAdjustment,
      smtReason: bullishLong.reason,
      tradePath: { signalTime: "2026-06-05T13:00:00.000Z", rrAchieved: 2.1 },
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
      ...baseSignal(bearishAgainstLong),
      outcome: "invalidation_first",
      fvgStatus: "ignored",
      htfAligned: true,
      liquidityTargetType: "previous_day_high",
      smtDivergenceType: bearishAgainstLong.divergenceType,
      smtConfirmsCandidate: bearishAgainstLong.confirmsCandidate,
      smtRejectsCandidate: bearishAgainstLong.rejectsCandidate,
      relativeStrengthLeader: bearishAgainstLong.relativeStrengthLeader,
      relativeWeaknessLeader: bearishAgainstLong.relativeWeaknessLeader,
      smtConfidenceAdjustment: bearishAgainstLong.confidenceAdjustment,
      smtReason: bearishAgainstLong.reason,
      tradePath: { signalTime: "2026-06-05T13:15:00.000Z", rrAchieved: -1 },
      researchOnly: true,
      provenance: {
        methodology: "ICT",
        sourceSet: "ICT Mentorship Core Content",
        replay: true,
        researchOnly: true,
        generatedAt: "2026-06-05T13:15:00.000Z"
      }
    }
  ]);
  assert.ok(diagnostics.bySmtDivergenceType.bullish_smt, "diagnostics should group bullish SMT");
  assert.ok(diagnostics.bySmtDivergenceType.bearish_smt, "diagnostics should group bearish SMT");
  assert.ok(diagnostics.bySmtConfirmsCandidate.confirms, "diagnostics should group SMT confirmations");
  assert.ok(diagnostics.bySmtRejectsCandidate.rejects, "diagnostics should group SMT rejections");
  assert.ok(Object.keys(diagnostics.byRelativeStrengthLeader).length > 0, "diagnostics should group relative strength leaders");
  assert.ok(suite.getDefaultReplayCalibrationFilters().some((filter) => filter.id === "require_smt_confirmation_for_index"));
  assert.ok(suite.getDefaultReplayCalibrationFilters().some((filter) => filter.id === "reject_mixed_index_alignment"));

  const smtJournalEvent = suite.buildIctIndexSmtJournalEvent(bullishLong);
  assert.equal(smtJournalEvent.eventType, "ict_index_smt_summary");
  assert.equal(smtJournalEvent.researchOnly, true);
  assert.equal(smtJournalEvent.authority.executionAuthority, "none");
  assert.equal(smtJournalEvent.safety.rawCandlesExcluded, true);
  assertCompact(smtJournalEvent, "SMT journal event");
  assert.equal(suite.appendIctIndexSmtJournalEvents([smtJournalEvent]).ok, true);

  process.stdout.write("GoTrader ICT Index SMT / Relative Strength smoke test passed.\n");
  process.stdout.write(`Bullish SMT: ${bullishLong.reason}\n`);
  process.stdout.write(`Bearish SMT: ${bearishShort.reason}\n`);
  process.stdout.write(`Authority: ${bullishLong.authority.executionAuthority}/${bullishLong.authority.brokerAuthority}/${bullishLong.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT Index SMT smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
