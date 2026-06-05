#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-phase2-models-test");
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
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
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
  return globalThis.__ICT_PHASE2_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_PHASE2_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const candle = (id, timestamp, open, high, low, close, timeframe = "5m") => ({
  id,
  symbol: "MNQ",
  timeframe,
  timestamp,
  open,
  high,
  low,
  close,
  volume: 1000
});

function bullishFixture() {
  const candles = [
    candle("b0", "2026-06-05T12:00:00.000Z", 105, 108, 103, 107),
    candle("b1", "2026-06-05T12:05:00.000Z", 107, 109, 104, 106),
    candle("b2", "2026-06-05T12:10:00.000Z", 106, 107, 98, 101),
    candle("b3", "2026-06-05T12:15:00.000Z", 101, 104, 96, 103),
    candle("b4", "2026-06-05T12:20:00.000Z", 103, 105, 101, 102),
    candle("b5", "2026-06-05T12:25:00.000Z", 102, 113, 102, 112),
    candle("b6", "2026-06-05T12:30:00.000Z", 112, 116, 110, 115),
    candle("b7", "2026-06-05T12:35:00.000Z", 115, 119, 113, 118)
  ];
  return {
    brokerSymbol: "USTECH",
    candles,
    htfCandles: {
      "15m": [candle("b15_0", "2026-06-05T12:00:00.000Z", 100, 111, 99, 108, "15m"), candle("b15_1", "2026-06-05T12:15:00.000Z", 108, 120, 104, 119, "15m")],
      "1h": [candle("b1h_0", "2026-06-05T12:00:00.000Z", 98, 121, 97, 118, "1h")]
    },
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    symbol: "MNQ"
  };
}

function bearishFixture() {
  const candles = [
    candle("s0", "2026-06-05T12:00:00.000Z", 118, 121, 116, 117),
    candle("s1", "2026-06-05T12:05:00.000Z", 117, 122, 115, 120),
    candle("s2", "2026-06-05T12:10:00.000Z", 120, 124, 117, 118),
    candle("s3", "2026-06-05T12:15:00.000Z", 118, 119, 116, 119),
    candle("s4", "2026-06-05T12:20:00.000Z", 119, 120, 110, 111),
    candle("s5", "2026-06-05T12:25:00.000Z", 111, 112, 104, 105),
    candle("s6", "2026-06-05T12:30:00.000Z", 105, 108, 102, 103),
    candle("s7", "2026-06-05T12:35:00.000Z", 103, 106, 100, 101)
  ];
  return {
    brokerSymbol: "USTECH",
    candles,
    htfCandles: {
      "15m": [candle("s15_0", "2026-06-05T12:00:00.000Z", 124, 125, 116, 118, "15m"), candle("s15_1", "2026-06-05T12:15:00.000Z", 118, 119, 100, 102, "15m")],
      "1h": [candle("s1h_0", "2026-06-05T12:00:00.000Z", 126, 127, 99, 101, "1h")]
    },
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    symbol: "MNQ"
  };
}

function compactAssert(value, label) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, `${label} must not expose raw candle arrays`);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"order(Data|s)?"\s*:|"position(Data|s)?"\s*:|"rawSnapshot"\s*:/i, `${label} must not expose secrets or account/order/position data`);
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const bullish = bullishFixture();
  const bearish = bearishFixture();

  const standard = suite.detectStandardOrderBlock({ candles: bullish.candles, primaryTimeframe: "5m" });
  assert.ok(standard, "standard order block should classify on bullish fixture");
  assert.equal(standard.variant, "standard_order_block");
  assert.equal(standard.displacementConfirmed, true);

  const classifications = suite.classifyOrderBlocks({ candles: bullish.candles, primaryTimeframe: "5m" });
  assert.ok(classifications.length >= 1, "order-block taxonomy should return compact candidates");
  assert.ok(classifications.every((item) => item.confidence >= 0 && item.confidence <= 1), "order-block confidence should be normalized");

  const taxonomy = suite.evaluateIctPhase2OrderBlockTaxonomy(bullish);
  const buy = suite.evaluateIctPhase2BreadAndButterBuy(bullish);
  const sell = suite.evaluateIctPhase2BreadAndButterSell(bearish);
  const osok = suite.evaluateIctPhase2OneShotOneKill(bullish);
  const signals = [taxonomy, buy, sell, osok];

  for (const signal of signals) {
    assert.equal(signal.phase, "phase_2", `${signal.strategyId} should be tagged Phase 2`);
    assert.equal(signal.provenance.researchOnly, true, `${signal.strategyId} provenance must stay research-only`);
    assert.equal(signal.provenance.phase, "phase_2", `${signal.strategyId} provenance should name Phase 2`);
    assert.ok(signal.approvedProfileDecision?.status, `${signal.strategyId} must pass through approved setup profile review`);
    assert.ok(["approved_research_candidate", "watchlist_candidate", "rejected_candidate", "no_trade"].includes(signal.approvedProfileDecision.status));
    compactAssert(signal, signal.strategyId);
  }

  assert.equal(taxonomy.strategyId, "ict-order-block-taxonomy");
  assert.equal(buy.strategyId, "ict-bread-and-butter-buy");
  assert.equal(sell.strategyId, "ict-bread-and-butter-sell");
  assert.equal(osok.strategyId, "ict-one-shot-one-kill");
  assert.ok(["research_only", "no_trade"].includes(osok.decision), "OSOK must only emit research_only or no_trade");

  const advisorSignals = suite.buildIctAdvisorSignals({
    brokerSymbol: "USTECH",
    candles: bullish.candles,
    htfCandles: bullish.htfCandles,
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    sourceSummary: {
      provider: "mt5_read_only",
      provenance: { sourceLabel: "test", providerSymbol: "USTECH" }
    },
    symbol: "MNQ"
  });
  assert.ok(advisorSignals.filter((signal) => signal.phase === "phase_2").length >= 4, "advisor should emit Phase 2 models");
  assert.ok(advisorSignals.every((signal) => signal.approvedProfileDecision?.status), "advisor signals should include approved profile status");

  const replayResult = suite.evaluateSignalOutcome({
    brokerSymbol: "USTECH",
    futureCandles: [
      candle("f0", "2026-06-05T12:40:00.000Z", 118, 122, 116, 121),
      candle("f1", "2026-06-05T12:45:00.000Z", 121, 126, 120, 125),
      candle("f2", "2026-06-05T12:50:00.000Z", 125, 128, 123, 127)
    ],
    htfTimeframes: ["15m", "1h"],
    lookaheadCandles: 3,
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    signal: taxonomy,
    signalCandle: bullish.candles.at(-1),
    symbol: "MNQ"
  });
  assert.equal(replayResult.phase, "phase_2", "replay result should preserve Phase 2 marker");
  assert.equal(replayResult.orderBlockVariant, taxonomy.orderBlock?.variant, "replay result should preserve order-block variant");
  assert.equal(replayResult.approvedProfileStatus, taxonomy.approvedProfileDecision?.status, "replay result should preserve profile status");
  compactAssert(replayResult, "Phase 2 replay result");

  const diagnostics = suite.buildReplayDiagnostics([replayResult]);
  assert.ok(diagnostics.byPhase.phase_2, "diagnostics should break down Phase 2 results");
  assert.ok(diagnostics.byOrderBlockVariant[replayResult.orderBlockVariant ?? "none"], "diagnostics should break down order-block variants");
  assert.equal(suite.assertIctReplayDiagnosticsOutputIsCompact({ diagnostics }).ok, true);

  const event = suite.buildIctAdvisorJournalEvent(taxonomy);
  assert.equal(event.phase, "phase_2");
  assert.equal(event.orderBlockVariant, taxonomy.orderBlock?.variant);
  assert.equal(event.approvedProfileStatus, taxonomy.approvedProfileDecision?.status);
  assert.equal(event.researchOnly, true);
  compactAssert(event, "Phase 2 advisor journal event");

  const missingHtf = suite.evaluateIctPhase2BreadAndButterBuy({ ...bullish, htfCandles: {} });
  assert.notEqual(missingHtf.approvedProfileDecision?.status, "approved_research_candidate", "missing HTF data should not approve a Phase 2 model");
  assert.ok(
    missingHtf.approvedProfileDecision?.rejectionReasons.some((reason) => /higher-timeframe/i.test(reason)),
    "missing HTF data should expose approved-profile blocker"
  );

  process.stdout.write("GoTrader ICT Phase 2 Models smoke test passed.\n");
  process.stdout.write(`Phase 2 signals: ${signals.map((signal) => `${signal.strategyId}:${signal.approvedProfileDecision?.status}`).join(", ")}\n`);
  process.stdout.write(`Replay phase: ${replayResult.phase}, orderBlockVariant: ${replayResult.orderBlockVariant ?? "none"}\n`);
  process.stdout.write("Authority: none/none/none\n");
}

main().catch((error) => {
  process.stderr.write(`ICT Phase 2 Models smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
