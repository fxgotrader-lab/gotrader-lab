#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-strategy-suite-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
  { root: mt5Root, file: "mt5ReadOnlyClient.ts" },
  { root: sourceRoot, file: "index.ts" }
];

function compileSuiteForNode() {
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
  return globalThis.__ICT_ADVISOR_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_ADVISOR_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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

function bullishFixture() {
  const candles = [
    candle("d1_0", "2026-06-01T19:00:00.000Z", 110, 113, 108, 112),
    candle("d1_1", "2026-06-01T20:00:00.000Z", 112, 120, 111, 118),
    candle("d1_2", "2026-06-01T21:00:00.000Z", 118, 119, 105, 108),
    candle("d1_3", "2026-06-01T22:00:00.000Z", 108, 116, 100, 112),
    candle("d2_0", "2026-06-02T08:00:00.000Z", 103, 105, 101, 102),
    candle("d2_1", "2026-06-02T08:05:00.000Z", 102, 103, 99, 101),
    candle("d2_2", "2026-06-02T08:10:00.000Z", 101, 103, 100.5, 102),
    candle("d2_3", "2026-06-02T08:15:00.000Z", 104, 111, 104, 110),
    candle("d2_4", "2026-06-02T08:20:00.000Z", 108, 112, 106, 107)
  ];
  return {
    snapshotId: "ict_bullish_fixture",
    symbol: "MNQ",
    brokerSymbol: "USTECH",
    provider: "mt5_read_only",
    timeframe: "5m",
    sourceFingerprint: "ict_bullish_fixture_fp",
    candles,
    higherTimeframeCandles: {
      weekly: [candle("w0", "2026-05-29T20:00:00.000Z", 100, 121, 99, 116)],
      daily: [candle("dhtf0", "2026-06-02T00:00:00.000Z", 101, 113, 99, 111)],
      h4: [candle("h4_0", "2026-06-02T04:00:00.000Z", 102, 112, 100, 110)]
    },
    relatedMarkets: {
      NQ: candles,
      ES: candles.map((item, index) => ({ ...item, id: `es_${index}`, open: item.open * 0.5, high: item.high * 0.5, low: item.low * 0.5, close: item.close * 0.5 })),
      YM: candles.map((item, index) => ({ ...item, id: `ym_${index}`, open: item.open * 2, high: item.high * 2, low: item.low * 2, close: item.close * 2 }))
    }
  };
}

function bearishFixture() {
  const candles = [
    candle("bd1_0", "2026-06-01T19:00:00.000Z", 110, 112, 107, 108),
    candle("bd1_1", "2026-06-01T20:00:00.000Z", 108, 120, 106, 112),
    candle("bd1_2", "2026-06-01T21:00:00.000Z", 112, 118, 101, 104),
    candle("bd1_3", "2026-06-01T22:00:00.000Z", 104, 116, 100, 102),
    candle("bd2_0", "2026-06-02T08:00:00.000Z", 116, 119, 114, 117),
    candle("bd2_1", "2026-06-02T08:05:00.000Z", 117, 121, 116, 118),
    candle("bd2_2", "2026-06-02T08:10:00.000Z", 118, 119, 117, 118.5),
    candle("bd2_3", "2026-06-02T08:15:00.000Z", 115, 115, 108, 109),
    candle("bd2_4", "2026-06-02T08:20:00.000Z", 110, 112, 106, 113)
  ];
  return {
    snapshotId: "ict_bearish_fixture",
    symbol: "MNQ",
    brokerSymbol: "USTECH",
    provider: "mt5_read_only",
    timeframe: "5m",
    sourceFingerprint: "ict_bearish_fixture_fp",
    candles,
    higherTimeframeCandles: {
      weekly: [candle("bw0", "2026-05-29T20:00:00.000Z", 121, 122, 98, 104)],
      daily: [candle("bdhtf0", "2026-06-02T00:00:00.000Z", 119, 122, 104, 108)],
      h4: [candle("bh4_0", "2026-06-02T04:00:00.000Z", 118, 120, 106, 109)]
    }
  };
}

function flatFixture() {
  const candles = Array.from({ length: 12 }, (_, index) =>
    candle(`flat_${index}`, `2026-06-02T09:${String(index * 5).padStart(2, "0")}:00.000Z`, 100, 101, 99, 100)
  );
  return {
    snapshotId: "ict_flat_fixture",
    symbol: "MNQ",
    provider: "mock",
    timeframe: "5m",
    candles
  };
}

function assertSignalSafety(signal) {
  assert.equal(signal.provenance.methodology, "ICT");
  assert.equal(signal.provenance.sourceSet, "ICT Mentorship Core Content");
  assert.equal(signal.provenance.researchOnly, true);
  assert.ok(signal.riskNotes.some((note) => /Research-only|execution authority/i.test(note)));
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const bullish = bullishFixture();
  const bearish = bearishFixture();
  const flat = flatFixture();

  const normalized = suite.normalizeCandles([...bullish.candles].reverse());
  assert.equal(normalized[0].id, "d1_0", "normalizeCandles should sort timestamps ascending");
  assert.ok(suite.groupCandlesBySession(bullish.candles).some((session) => session.session === "London" && session.candles.length > 0), "session grouping should include London candles");

  assert.ok(suite.detectSwingHighs(bullish.candles, 1).length >= 1, "swing highs should be detected");
  assert.ok(suite.detectSwingLows(bullish.candles, 1).length >= 1, "swing lows should be detected");
  assert.ok(
    suite.detectEqualHighs([
      candle("eh0", "2026-06-01T08:00:00.000Z", 100, 101, 98, 100),
      candle("eh1", "2026-06-01T08:05:00.000Z", 100, 105, 99, 102),
      candle("eh2", "2026-06-01T08:10:00.000Z", 102, 110, 101, 103),
      candle("eh3", "2026-06-01T08:15:00.000Z", 103, 106, 100, 102),
      candle("eh4", "2026-06-01T08:20:00.000Z", 102, 105, 100, 103),
      candle("eh5", "2026-06-01T08:25:00.000Z", 103, 110.02, 101, 104),
      candle("eh6", "2026-06-01T08:30:00.000Z", 104, 106, 99, 101),
      candle("eh7", "2026-06-01T08:35:00.000Z", 101, 104, 98, 100)
    ]).length >= 1,
    "equal highs should be buy-side liquidity"
  );
  assert.ok(
    suite.detectEqualLows([
      candle("el0", "2026-06-01T08:00:00.000Z", 100, 104, 96, 101),
      candle("el1", "2026-06-01T08:05:00.000Z", 101, 103, 94, 99),
      candle("el2", "2026-06-01T08:10:00.000Z", 99, 102, 90, 98),
      candle("el3", "2026-06-01T08:15:00.000Z", 98, 104, 94, 102),
      candle("el4", "2026-06-01T08:20:00.000Z", 102, 105, 95, 101),
      candle("el5", "2026-06-01T08:25:00.000Z", 101, 103, 90.02, 99),
      candle("el6", "2026-06-01T08:30:00.000Z", 99, 106, 96, 103),
      candle("el7", "2026-06-01T08:35:00.000Z", 103, 107, 97, 104)
    ]).length >= 1,
    "equal lows should be sell-side liquidity"
  );

  assert.ok(suite.detectLiquidityPools(bullish.candles).some((pool) => pool.type === "previous_day_low"), "previous day low liquidity should be detected");
  assert.equal(suite.detectLiquiditySweep(bullish.candles)?.direction, "bullish", "bullish fixture should sweep sell-side liquidity");
  assert.equal(suite.detectLiquiditySweep(bearish.candles)?.direction, "bearish", "bearish fixture should sweep buy-side liquidity");
  assert.equal(suite.detectDisplacement(bullish.candles)?.direction, "bullish", "bullish displacement should be detected");
  assert.equal(suite.detectFairValueGap(bullish.candles)?.direction, "bullish", "bullish FVG should be detected");
  assert.equal(suite.detectFairValueGap(bearish.candles)?.direction, "bearish", "bearish FVG should be detected");
  assert.ok(suite.detectOrderBlock(bullish.candles), "bullish order block should be detected");
  assert.ok(suite.detectBreakerBlock(bearish.candles) || suite.detectMitigationBlock(bearish.candles) || suite.detectReclaimedOrderBlock(bearish.candles), "order-block variants should classify");
  assert.ok(
    suite.calculateCentralBankDealersRange([
      candle("cbdr_0", "2026-06-02T00:00:00.000Z", 100, 103, 99, 101),
      candle("cbdr_1", "2026-06-02T00:30:00.000Z", 101, 104, 98, 102),
      candle("cbdr_2", "2026-06-02T08:00:00.000Z", 102, 110, 100, 108)
    ]),
    "CBDR high/low should be detected"
  );
  assert.ok(
    suite.detectLowResistanceLiquidityRun(
      bullish.candles,
      suite.detectLiquidityPools(bullish.candles).find((pool) => pool.type === "previous_day_high")
    ).valid,
    "low-resistance liquidity run should be detected"
  );
  assert.ok(suite.detectMarketReversal(bullish.candles).valid, "market reversal should require matching sweep and displacement");

  const htfBull = suite.evaluateIctHtfBias(bullish);
  assert.equal(htfBull.decision, "research_only", "bullish HTF model should produce research context");
  assert.equal(htfBull.side, "long");
  assertSignalSafety(htfBull);

  const htfBear = suite.evaluateIctHtfBias(bearish);
  assert.equal(htfBear.side, "short", "bearish HTF model should produce short-side research context");

  const htfFlat = suite.evaluateIctHtfBias(flat);
  assert.equal(htfFlat.decision, "no_trade", "mixed/flat HTF bias should return no_trade");

  const daily = suite.evaluateIctDailyRange(bullish);
  assert.notEqual(daily.dailyRangeProjection.dailyProfile, "low_probability_day", "daily range should classify a profile");

  const liquidity = suite.evaluateIctLiquidityRun(bullish);
  assert.equal(liquidity.decision, "research_only", "liquidity run should be a research candidate");

  const fvg = suite.evaluateIctFvgDisplacement(bullish);
  assert.equal(fvg.decision, "research_only", "bullish FVG after sweep/displacement should pass");

  const fvgWrongLocation = suite.evaluateIctFvgDisplacement({
    ...bullish,
    candles: bullish.candles.map((item, index) => (index === bullish.candles.length - 1 ? { ...item, close: 118, high: 119, low: 116 } : item))
  });
  assert.equal(fvgWrongLocation.decision, "no_trade", "FVG in wrong premium/discount location should be rejected");

  const orderBlock = suite.evaluateIctOrderBlock(bullish);
  assert.equal(orderBlock.decision, "research_only", "order block confluence should pass on bullish fixture");

  const buy = suite.evaluateIctBreadAndButterBuy(bullish);
  assert.equal(buy.decision, "research_only", `Bread & Butter buy should produce a research long: ${buy.noTradeReasons.join("; ")}`);

  const sell = suite.evaluateIctBreadAndButterSell(bearish);
  assert.equal(sell.decision, "research_only", `Bread & Butter sell should produce a research short: ${sell.noTradeReasons.join("; ")}`);

  const noSweepBuy = suite.evaluateIctBreadAndButterBuy(flat);
  assert.equal(noSweepBuy.decision, "no_trade", "Bread & Butter should reject missing sweep/displacement");

  const osok = suite.evaluateIctOneShotOneKill(bullish);
  assert.equal(osok.decision, "research_only", "OSOK should pass only full confluence fixture");

  const osokMissing = suite.evaluateIctOneShotOneKill(flat);
  assert.equal(osokMissing.decision, "no_trade", "OSOK should fail when one major condition is missing");

  const indexRs = suite.evaluateIctIndexFuturesRelativeStrength(bullish);
  assert.equal(indexRs.decision, "research_only", "coherent indexes should confirm relative strength");

  const conflictingIndex = suite.evaluateIctIndexFuturesRelativeStrength({
    ...bullish,
    relatedMarkets: {
      NQ: [
        candle("nq_up_0", "2026-06-02T08:00:00.000Z", 100, 102, 99, 101),
        candle("nq_up_1", "2026-06-02T08:05:00.000Z", 101, 108, 100, 107)
      ],
      ES: [
        candle("es_down_0", "2026-06-02T08:00:00.000Z", 120, 121, 118, 119),
        candle("es_down_1", "2026-06-02T08:05:00.000Z", 119, 120, 112, 113)
      ],
      YM: [
        candle("ym_up_0", "2026-06-02T08:00:00.000Z", 200, 202, 198, 201),
        candle("ym_up_1", "2026-06-02T08:05:00.000Z", 201, 210, 200, 209)
      ]
    }
  });
  assert.equal(conflictingIndex.decision, "no_trade", `conflicting indexes should reduce confidence/return no_trade: ${conflictingIndex.riskNotes.join("; ")}`);

  const highNews = suite.evaluateIctRiskGovernor(
    { ...bullish, newsEvents: [{ eventId: "cpi", impact: "high", scheduledAt: new Date().toISOString(), reason: "CPI release window." }] },
    buy
  );
  assert.equal(highNews.decision, "no_trade", "high-impact news should force flat/no_trade");

  const lowRr = suite.evaluateIctRiskGovernor(bullish, { ...buy, rrEstimate: 0.5 });
  assert.equal(lowRr.decision, "no_trade", "low RR should force flat/no_trade");

  const missingData = suite.evaluateIctRiskGovernor({ ...bullish, candles: [] }, buy);
  assert.equal(missingData.decision, "no_trade", "missing candles should force flat/no_trade");

  const dailyLimit = suite.evaluateIctRiskGovernor(bullish, buy, undefined, [buy, fvg, liquidity]);
  assert.equal(dailyLimit.decision, "no_trade", "daily signal frequency limit should be respected");

  const evaluation = suite.evaluateIctStrategySuite(bullish);
  assert.equal(evaluation.packageName, "ict-strategy-suite");
  assert.equal(evaluation.authority.executionAuthority, "none");
  assert.equal(evaluation.authority.brokerAuthority, "none");
  assert.equal(evaluation.authority.readinessOverrideAuthority, "none");
  assert.ok(evaluation.signals.length >= 10, "suite should evaluate all strategy IDs");
  assert.equal(evaluation.journalEvents.length, evaluation.signals.length, "every evaluated candidate should write a journal event");
  assert.ok(evaluation.journalEvents.some((event) => event.decision === "no_trade"), "no_trade decisions should also journal");
  for (const event of evaluation.journalEvents) {
    assert.equal(event.researchOnly, true, "journal provenance must remain research-only");
    assert.equal(event.sourceSet, "ICT Mentorship Core Content");
  }
  const journalWrite = suite.appendIctStrategyJournalEvents(evaluation.journalEvents);
  assert.equal(journalWrite.ok, true, "journal append should be safe in Node memory mode");

  const activeSource = {
    sourceId: "mt5_read_only:MNQ:USTECH:5m:test",
    provider: "mt5_read_only",
    symbol: "MNQ",
    normalizedSymbol: "MNQ",
    timeframe: "5m",
    candles: bullish.candles,
    candleCount: bullish.candles.length,
    firstTimestamp: bullish.candles[0].timestamp,
    lastTimestamp: bullish.candles.at(-1).timestamp,
    storageBackend: "memory",
    dataQuality: "sufficient",
    eligibility: { chartDisplay: true, quickAnalysis: true, researchCycle: true, walkForward: false },
    eligibilityReasons: [],
    warnings: [],
    provenance: {
      sourceLabel: "MT5 read-only USTECH 5m test source",
      providerSymbol: "USTECH",
      generatedAt: new Date().toISOString()
    },
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    },
    fingerprint: "mt5_test_primary_fp",
    roles: ["research", "chart_display", "available"]
  };
  const htf15 = {
    ...activeSource,
    sourceId: "mt5_read_only:MNQ:USTECH:15m:context",
    timeframe: "15m",
    candleCount: 2,
    candles: [
      candle("h15_0", "2026-06-02T08:00:00.000Z", 100, 106, 99, 104),
      candle("h15_1", "2026-06-02T08:15:00.000Z", 104, 112, 102, 110)
    ],
    fingerprint: "mt5_test_15m_fp"
  };
  const htf1h = {
    ...activeSource,
    sourceId: "mt5_read_only:MNQ:USTECH:1h:context",
    timeframe: "1h",
    candleCount: 2,
    candles: [
      candle("h1_0", "2026-06-02T07:00:00.000Z", 99, 106, 98, 104),
      candle("h1_1", "2026-06-02T08:00:00.000Z", 104, 113, 103, 111)
    ],
    fingerprint: "mt5_test_1h_fp"
  };
  globalThis.__ICT_ADVISOR_TEST_SOURCES = new Map([
    [activeSource.sourceId, activeSource],
    [htf15.sourceId, htf15],
    [htf1h.sourceId, htf1h]
  ]);
  const runtimeSnapshot = {
    marketData: {
      symbol: "MNQ",
      contract: "MNQ",
      timeframe: "5m",
      activeResearchSource: activeSource
    },
    mt5ReadOnly: {
      brokerSymbol: "USTECH",
      higherTimeframeSources: [
        {
          provider: "mt5_read_only",
          requestedSymbol: "MNQ",
          brokerSymbol: "USTECH",
          timeframe: "15m",
          candleCount: htf15.candleCount,
          fingerprint: htf15.fingerprint,
          eligibilityState: "eligible_for_analysis"
        },
        {
          provider: "mt5_read_only",
          requestedSymbol: "MNQ",
          brokerSymbol: "USTECH",
          timeframe: "1h",
          candleCount: htf1h.candleCount,
          fingerprint: htf1h.fingerprint,
          eligibilityState: "eligible_for_analysis"
        }
      ]
    }
  };
  const advisorPacket = await suite.buildIctAdvisorPacketFromRuntime(runtimeSnapshot);
  assert.equal(advisorPacket.source, "gotrader_ict_strategy_suite", "advisor packet source mismatch");
  assert.equal(advisorPacket.mode, "advisory_only", "advisor packet must be advisory_only");
  assert.equal(advisorPacket.requestedSymbol, "MNQ", "advisor packet requested symbol mismatch");
  assert.equal(advisorPacket.brokerSymbol, "USTECH", "advisor packet broker symbol mismatch");
  assert.deepEqual(advisorPacket.htfTimeframes.sort(), ["15m", "1h"].sort(), "advisor packet should keep primary 5m separate from 15m/1h HTF context");
  assert.ok(advisorPacket.signals.length >= 8, "advisor packet should include Phase 1 and Phase 2 strategy signals");
  assert.ok(advisorPacket.signals.some((signal) => signal.strategyId === "ict-fvg-displacement"), "advisor packet should include FVG signal");
  assert.ok(advisorPacket.signals.some((signal) => signal.strategyId === "ict-order-block-taxonomy"), "advisor packet should include order-block taxonomy signal");
  assert.ok(advisorPacket.signals.some((signal) => signal.phase === "phase_2"), "advisor packet should include Phase 2 model signals");
  assert.ok(
    advisorPacket.signals.every((signal) => signal.approvedProfileDecision?.status),
    "every advisor signal should be evaluated by the approved setup profile layer"
  );
  assert.equal(advisorPacket.authority.executionAuthority, "none", "advisor packet execution authority must be none");
  assert.equal(advisorPacket.authority.brokerAuthority, "none", "advisor packet broker authority must be none");
  assert.equal(advisorPacket.authority.readinessOverrideAuthority, "none", "advisor packet readiness authority must be none");
  const compactCheck = suite.assertIctAdvisorPacketIsCompact(advisorPacket);
  assert.equal(compactCheck.ok, true, "advisor packet must stay compact and exclude raw candles/secrets/account/order/position data");
  assert.doesNotMatch(JSON.stringify(advisorPacket), /"candles"\s*:/i, "advisor packet must not include raw candle arrays");
  assert.equal(advisorPacket.journalEvents.length, advisorPacket.signals.length, "advisor packet should journal every compact ICT signal");
  for (const event of advisorPacket.journalEvents) {
    assert.equal(event.researchOnly, true, "advisor journal event must be research-only");
    assert.ok(event.phase === "phase_1" || event.phase === "phase_2", "advisor journal event should include model phase");
    assert.ok(event.setup, "advisor journal event should include compact setup");
    assert.ok(!("candles" in event), "advisor journal event must not persist raw candles");
  }
  const noHtfPacket = await suite.buildIctAdvisorPacketFromRuntime({
    ...runtimeSnapshot,
    mt5ReadOnly: {
      brokerSymbol: "USTECH",
      higherTimeframeSources: []
    }
  });
  const noHtfBiasSignal = noHtfPacket.signals.find((signal) => signal.strategyId === "ict-htf-bias");
  assert.equal(noHtfPacket.htfTimeframes.length, 0, "missing HTF runtime should produce an empty HTF context");
  assert.equal(noHtfBiasSignal?.decision, "no_trade", "missing HTF context should block the HTF bias signal");
  assert.ok(
    noHtfBiasSignal?.noTradeReasons.some((reason) => /Missing higher-timeframe context/i.test(reason)),
    "missing HTF context should be visible in advisor no-trade reasons"
  );

  const serialized = JSON.stringify(evaluation);
  assert.doesNotMatch(serialized, /order_placement|executionAllowed":true|brokerAuthority":"[^n]|readinessOverrideAuthority":"[^n]/i);

  process.stdout.write("GoTrader ICT Strategy Suite smoke test passed.\n");
  process.stdout.write(`Signals evaluated: ${evaluation.signals.length}\n`);
  process.stdout.write(`Journal events: ${evaluation.journalEvents.length}\n`);
  process.stdout.write(`Best risk decision: ${evaluation.riskDecision.decision}\n`);
  process.stdout.write(`Authority: ${evaluation.authority.executionAuthority}/${evaluation.authority.brokerAuthority}/${evaluation.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT Strategy Suite smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
