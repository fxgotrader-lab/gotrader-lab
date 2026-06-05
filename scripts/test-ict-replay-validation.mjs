#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-replay-validation-test");
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
  return globalThis.__ICT_REPLAY_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_REPLAY_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const candle = (id, timestamp, open, high, low, close) => ({
  id,
  symbol: "MNQ",
  timeframe: "5m",
  timestamp,
  open,
  high,
  low,
  close,
  volume: 1000
});

const signal = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  side: "long",
  decision: "research_only",
  confidence: 0.72,
  bias: {
    primary: "bullish",
    htf: { "15m": "bullish", "1h": "bullish" },
    composite: "bullish"
  },
  setup: "fvg_retracement",
  entryZone: { type: "fair_value_gap", high: 102, low: 100, midpoint: 101 },
  invalidation: 95,
  target: 111,
  rrEstimate: 2,
  fairValueGap: {
    direction: "bullish",
    high: 102,
    low: 100,
    midpoint: 101,
    timeframe: "5m",
    mitigated: false,
    createdAt: "2026-06-05T13:00:00.000Z"
  },
  noTradeReasons: [],
  riskNotes: ["Research-only replay validation. No broker execution authority."],
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-05T13:00:00.000Z"
  },
  ...overrides
});

function evaluate(suite, namedSignal, futureCandles, options = {}) {
  return suite.evaluateSignalOutcome({
    brokerSymbol: "USTECH",
    futureCandles,
    htfTimeframes: ["15m", "1h"],
    lookaheadCandles: options.lookaheadCandles ?? 3,
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    signal: namedSignal,
    signalCandle: candle("signal", "2026-06-05T13:00:00.000Z", 100, 102, 99, 101),
    symbol: "MNQ"
  });
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  const longTarget = evaluate(suite, signal(), [
    candle("lt_1", "2026-06-05T13:05:00.000Z", 101, 104, 100, 103),
    candle("lt_2", "2026-06-05T13:10:00.000Z", 103, 112, 102, 111),
    candle("lt_3", "2026-06-05T13:15:00.000Z", 111, 113, 110, 112)
  ]);
  assert.equal(longTarget.outcome, "target_first", "long setup should reach target before invalidation");
  assert.equal(longTarget.fvgStatus, "respected", "bullish FVG should be respected after tap and target delivery");

  const shortTarget = evaluate(
    suite,
    signal({
      side: "short",
      bias: { primary: "bearish", htf: { "15m": "bearish", "1h": "bearish" }, composite: "bearish" },
      invalidation: 105,
      target: 90,
      entryZone: { type: "fair_value_gap", high: 101, low: 99, midpoint: 100 },
      fairValueGap: {
        direction: "bearish",
        high: 101,
        low: 99,
        midpoint: 100,
        timeframe: "5m",
        mitigated: false,
        createdAt: "2026-06-05T13:00:00.000Z"
      }
    }),
    [
      candle("st_1", "2026-06-05T13:05:00.000Z", 100, 101, 96, 97),
      candle("st_2", "2026-06-05T13:10:00.000Z", 97, 98, 89, 90),
      candle("st_3", "2026-06-05T13:15:00.000Z", 90, 94, 88, 92)
    ]
  );
  assert.equal(shortTarget.outcome, "target_first", "short setup should reach target before invalidation");

  const invalidationFirst = evaluate(suite, signal(), [
    candle("if_1", "2026-06-05T13:05:00.000Z", 101, 103, 94, 96),
    candle("if_2", "2026-06-05T13:10:00.000Z", 96, 112, 95, 111),
    candle("if_3", "2026-06-05T13:15:00.000Z", 111, 113, 110, 112)
  ]);
  assert.equal(invalidationFirst.outcome, "invalidation_first", "invalidation should win when hit before target");

  const partialTarget = evaluate(suite, signal(), [
    candle("pt_1", "2026-06-05T13:05:00.000Z", 101, 106, 100, 105),
    candle("pt_2", "2026-06-05T13:10:00.000Z", 105, 106.2, 101, 104),
    candle("pt_3", "2026-06-05T13:15:00.000Z", 104, 106, 100, 102)
  ]);
  assert.equal(partialTarget.outcome, "partial_target", "MFE >= 50% of target distance should mark partial target");

  const stalled = evaluate(suite, signal(), [
    candle("stall_1", "2026-06-05T13:05:00.000Z", 101, 103, 100, 102),
    candle("stall_2", "2026-06-05T13:10:00.000Z", 102, 103, 99, 101),
    candle("stall_3", "2026-06-05T13:15:00.000Z", 101, 103, 100, 102)
  ]);
  assert.equal(stalled.outcome, "stalled", "low MFE with no target/invalidation should stall");

  const insufficient = evaluate(suite, signal(), [candle("insuf_1", "2026-06-05T13:05:00.000Z", 101, 112, 100, 111)], {
    lookaheadCandles: 3
  });
  assert.equal(insufficient.outcome, "insufficient_future_candles", "short future sample should be insufficient");

  const noTrade = evaluate(
    suite,
    signal({
      side: "flat",
      decision: "no_trade",
      setup: "no_trade",
      noTradeReasons: ["Missing higher-timeframe context."]
    }),
    [
      candle("nt_1", "2026-06-05T13:05:00.000Z", 101, 102, 99, 100),
      candle("nt_2", "2026-06-05T13:10:00.000Z", 100, 101, 98, 99),
      candle("nt_3", "2026-06-05T13:15:00.000Z", 99, 101, 98, 100)
    ]
  );
  assert.equal(noTrade.outcome, "no_trade", "no_trade signals should replay as no_trade");

  const fullMitigation = evaluate(suite, signal(), [
    candle("fm_1", "2026-06-05T13:05:00.000Z", 101, 102, 99, 99),
    candle("fm_2", "2026-06-05T13:10:00.000Z", 99, 103, 98, 101),
    candle("fm_3", "2026-06-05T13:15:00.000Z", 101, 104, 100, 103)
  ]);
  assert.equal(fullMitigation.fvgStatus, "fully_mitigated", "close through bullish FVG low should fully mitigate");

  const summary = suite.summarizeReplayResults(
    {
      symbol: "MNQ",
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candles: [],
      replayWindowSize: 4,
      lookaheadCandles: 3,
      researchOnly: true
    },
    [longTarget, shortTarget, invalidationFirst, partialTarget, stalled, insufficient, noTrade],
    7
  );
  assert.equal(summary.totalSignals, 7);
  assert.equal(summary.targetFirstCount, 2);
  assert.equal(summary.invalidationFirstCount, 1);
  assert.equal(summary.partialTargetCount, 1);
  assert.equal(summary.stalledCount, 1);
  assert.equal(summary.insufficientFutureCandlesCount, 1);
  assert.equal(summary.totalNoTrades, 1);
  assert.ok(summary.mostCommonNoTradeReasons.some((item) => item.reason === "Missing higher-timeframe context."));

  const replayCandles = [
    candle("r_0", "2026-06-05T12:00:00.000Z", 100, 102, 99, 101),
    candle("r_1", "2026-06-05T12:05:00.000Z", 101, 103, 100, 102),
    candle("r_2", "2026-06-05T12:10:00.000Z", 102, 104, 101, 103),
    candle("r_3", "2026-06-05T12:15:00.000Z", 103, 105, 102, 104),
    candle("r_4", "2026-06-05T12:20:00.000Z", 104, 106, 103, 105),
    candle("r_5", "2026-06-05T12:25:00.000Z", 105, 107, 104, 106),
    candle("r_6", "2026-06-05T12:30:00.000Z", 106, 108, 105, 107),
    candle("r_7", "2026-06-05T12:35:00.000Z", 107, 109, 106, 108)
  ];
  const report = suite.runIctReplayValidation({
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candles: replayCandles,
    htfCandles: {
      "15m": replayCandles,
      "1h": replayCandles
    },
    replayWindowSize: 4,
    lookaheadCandles: 2,
    researchOnly: true
  });
  assert.equal(report.researchOnly, true);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.ok(report.results.length > 0, "full replay validation should produce compact results");
  assert.ok(report.journalEvents.length === report.results.length, "each replay result should create a compact journal event");
  for (const event of report.journalEvents) {
    assert.equal(event.eventType, "ict_replay_result");
    assert.equal(event.researchOnly, true);
    assert.ok(!("candles" in event), "replay journal event must not persist raw candles");
  }
  const compactCheck = suite.assertIctReplayOutputIsCompact(report);
  assert.equal(compactCheck.ok, true, "replay output must stay compact and authority-none");
  assert.doesNotMatch(JSON.stringify(report), /"candles"\s*:/i, "replay output must not expose raw candle arrays");

  process.stdout.write("GoTrader ICT Replay Validation smoke test passed.\n");
  process.stdout.write(`Direct outcomes: ${[longTarget, shortTarget, invalidationFirst, partialTarget, stalled, insufficient, noTrade].map((item) => item.outcome).join(", ")}\n`);
  process.stdout.write(`Replay report signals: ${report.results.length}\n`);
  process.stdout.write(`Authority: ${report.authority.executionAuthority}/${report.authority.brokerAuthority}/${report.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT Replay Validation smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
