#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const ictRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const opportunityRoot = path.join(projectRoot, "src", "lib", "currentOpportunity");
const outRoot = path.join(projectRoot, ".gotrader", "session-raid-reversal-test");
const sourceFiles = [
  { root: ictRoot, file: "ictTradeConstructionTypes.ts" },
  { root: ictRoot, file: "ictTradeConstruction.ts" },
  { root: ictRoot, file: "ictSessionRaidReversalTypes.ts" },
  { root: ictRoot, file: "ictSessionRaidReversal.ts" },
  { root: opportunityRoot, file: "currentOpportunityTypes.ts" },
  { root: opportunityRoot, file: "buildCurrentOpportunityContext.ts" },
  { root: opportunityRoot, file: "detectCurrentOpportunities.ts" }
];

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const { root, file } of sourceFiles) {
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
      .replace(/from\s+"..\/ict-strategy-suite\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'..\/ict-strategy-suite\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

const nyIso = (dateKey, hour, minute = 0) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute)).toISOString();
};

const candle = (dateKey, hour, minute, open, high, low, close) => ({
  timestamp: nyIso(dateKey, hour, minute),
  open,
  high,
  low,
  close,
  volume: 100
});

function validScenario5m() {
  const candles = [];
  // Prior trading day reference levels.
  candles.push(candle("2026-06-09", 9, 30, 96, 103, 95, 101));
  candles.push(candle("2026-06-09", 10, 0, 101, 102, 86, 88));
  candles.push(candle("2026-06-09", 15, 55, 89, 92, 87, 91));
  // Asia consolidation belongs to the June 10 trading date.
  candles.push(candle("2026-06-09", 20, 0, 97.5, 98.5, 96.7, 98.1));
  candles.push(candle("2026-06-09", 20, 30, 98.1, 99.2, 97.4, 98.9));
  candles.push(candle("2026-06-09", 21, 0, 98.9, 99.4, 96.9, 97.8));
  candles.push(candle("2026-06-09", 22, 0, 97.8, 98.6, 96.5, 97.1));
  candles.push(candle("2026-06-09", 23, 0, 97.1, 98.9, 96.8, 98.3));
  candles.push(candle("2026-06-10", 0, 0, 98.1, 99.1, 97.2, 98.6));
  candles.push(candle("2026-06-10", 0, 30, 98.6, 99.3, 97.7, 98.9));
  // London expansion and liquidity capture.
  candles.push(candle("2026-06-10", 2, 0, 98.9, 100.2, 98.1, 99.8));
  candles.push(candle("2026-06-10", 2, 45, 99.8, 102.4, 99.4, 101.9));
  candles.push(candle("2026-06-10", 3, 45, 101.9, 104.8, 101.3, 104.2));
  candles.push(candle("2026-06-10", 4, 15, 104.2, 105.2, 102.9, 103.5));
  candles.push(candle("2026-06-10", 5, 0, 103.5, 104.1, 101.5, 102.3));
  candles.push(candle("2026-06-10", 8, 55, 102.3, 103, 100.8, 101.4));
  candles.push(candle("2026-06-10", 9, 20, 101.4, 104, 100.9, 103.8));
  // NY raid and bearish shift.
  candles.push(candle("2026-06-10", 9, 35, 103.8, 106.5, 102, 105.4));
  candles.push(candle("2026-06-10", 9, 40, 105.4, 105.8, 100.9, 101.3));
  candles.push(candle("2026-06-10", 9, 45, 101.3, 101.6, 96.4, 97.2));
  candles.push(candle("2026-06-10", 9, 50, 97.2, 98.4, 94.5, 95.7));
  candles.push(candle("2026-06-10", 10, 0, 95.7, 99.5, 94, 96.2));
  candles.push(candle("2026-06-10", 10, 15, 96.2, 101, 95.8, 99.8));
  candles.push(candle("2026-06-10", 10, 30, 99.8, 100.4, 91, 92.2));
  candles.push(candle("2026-06-10", 10, 45, 92.2, 92.8, 84.8, 86.2));
  for (let index = 0; index < 24; index += 1) {
    const localMinute = 10 * 60 + 50 + index * 5;
    const hour = Math.floor(localMinute / 60);
    const minute = localMinute % 60;
    const open = 86.2 + index * 0.08;
    candles.push(candle("2026-06-10", hour, minute, open, open + 0.8, open - 1.1, open - 0.2));
  }
  return candles;
}

function validScenario15m() {
  return [
    candle("2026-06-10", 9, 30, 103.8, 106.5, 102, 105.4),
    candle("2026-06-10", 9, 45, 105.4, 105.8, 98, 99),
    candle("2026-06-10", 10, 0, 98.8, 99.5, 94, 96),
    candle("2026-06-10", 10, 15, 96.2, 101, 95.8, 99.8),
    candle("2026-06-10", 10, 30, 99.8, 100.4, 91, 92.2),
    candle("2026-06-10", 10, 45, 92.2, 92.8, 84.8, 86.2)
  ];
}

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

function assertSafe(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.doesNotMatch(serialized, /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i);
  assert.deepEqual(value.authority, authorityNone);
}

async function main() {
  compileForNode();
  const detector = await import(pathToFileURL(path.join(outRoot, "ictSessionRaidReversal.mjs")).href);
  const contextBuilder = await import(pathToFileURL(path.join(outRoot, "buildCurrentOpportunityContext.mjs")).href);
  const scanner = await import(pathToFileURL(path.join(outRoot, "detectCurrentOpportunities.mjs")).href);

  const base = {
    candles5m: validScenario5m(),
    candles15m: validScenario15m(),
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    sourceProvider: "mt5_read_only",
    sourceFingerprint: "mt5|USTECH|MNQ|5m|session-raid-fixture",
    primaryTimeframe: "5m",
    entryTimeframe: "15m",
    htfContext: { H1: [{}], H4: [{}], D1: [{}] },
    weeklyBiasDirection: "bearish",
    sundayOpenOverride: 90,
    timingZone: "America/New_York"
  };

  const narrative = detector.evaluateIctSessionRaidReversal(base);
  assert.equal(narrative.narrativeId, "nasdaq_london_raid_ny_reversal_v1");
  assert.equal(narrative.status, "complete_bearish_reversal_candidate");
  assert.equal(narrative.side, "short");
  assert.ok(narrative.steps.every((step) => step.detected), "all synthetic steps should be detected");
  assert.equal(narrative.referenceLevels.currentPremiumDiscount, "discount");
  assert.equal(narrative.referenceLevels.sundayOpen.price, 90);
  assert.ok(narrative.entry);
  assert.ok(narrative.invalidation);
  assert.ok(narrative.target);
  assert.ok(narrative.rr >= 2);
  assert.equal(narrative.canCreateValidationChainEntry, true);
  assert.match(narrative.bearishScenario, /Sunday Open 90/);
  assertSafe(narrative);

  const packet = {
    generatedAt: "2026-06-10T16:00:00.000Z",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h", "4h", "1d"],
    activeSource: {
      provider: "mt5_read_only",
      candleCount: 1000,
      sourceFingerprint: base.sourceFingerprint,
      sourceLabel: "MT5 read-only USTECH",
      sourceStatus: {
        isMockOrSample: false,
        isResearchActive: true,
        isProxyInstrument: true,
        statusLabel: "MT5 read-only research active"
      }
    },
    marketAnalysisContext: {
      analysisDepthStatus: "sufficient",
      analysisTimeframesUsed: ["M5", "M15", "H1", "H4", "D1"],
      missingTimeframes: [],
      analysisTimeframes: [{ timeframe: "M5", candleCount: 17799, availableLookbackDays: 88.95 }]
    },
    compactSummary: {},
    sessionRaidReversal: narrative,
    recommendedSignal: {
      setup: "no_trade",
      side: "flat",
      confidence: 0,
      summary: "No generic signal.",
      noTradeReasons: []
    },
    approvedProfileDecision: { status: "no_trade" }
  };
  const context = contextBuilder.buildCurrentOpportunityContext({ packet });
  const scan = scanner.detectCurrentOpportunities(context);
  const sessionOpportunity = scan.opportunities.find((item) => item.strategyId === "nasdaq_london_raid_ny_reversal_v1");
  assert.ok(sessionOpportunity, "scanner should surface session raid narrative");
  assert.equal(sessionOpportunity.status, "valid_candidate");
  assert.equal(sessionOpportunity.classification, "trade_candidate");
  assert.ok(sessionOpportunity.requiredValidation.includes("replay_required"));
  assertSafe(scan);

  const noAsia = detector.evaluateIctSessionRaidReversal({
    ...base,
    candles5m: validScenario5m().filter((item) => !item.timestamp.startsWith("2026-06-10T00") && !item.timestamp.startsWith("2026-06-10T01"))
  });
  assert.notEqual(noAsia.status, "complete_bearish_reversal_candidate");
  assert.ok(["near_miss", "rejected", "needs_more_data"].includes(noAsia.status));
  assertSafe(noAsia);

  const noRaid = detector.evaluateIctSessionRaidReversal({
    ...base,
    candles5m: validScenario5m().map((item) =>
      [nyIso("2026-06-10", 9, 35), nyIso("2026-06-10", 9, 40)].includes(item.timestamp)
        ? { ...item, high: 104.8, close: Math.min(item.close, 104.2) }
        : item
    )
  });
  assert.equal(noRaid.status, "forming");
  assert.ok(noRaid.missingConditions.includes("ny_london_high_raid"));
  assertSafe(noRaid);

  const noMss = detector.evaluateIctSessionRaidReversal({
    ...base,
    candles5m: validScenario5m().map((item) =>
      item.timestamp >= nyIso("2026-06-10", 9, 45)
        ? { ...item, open: 102, high: 103, low: 101.2, close: 102.4 }
        : item
    )
  });
  assert.equal(noMss.status, "forming");
  assert.ok(noMss.missingConditions.includes("bearish_mss"));
  assertSafe(noMss);

  const noFvg = detector.evaluateIctSessionRaidReversal({
    ...base,
    candles15m: validScenario15m().map((item) =>
      item.timestamp >= nyIso("2026-06-10", 10, 0)
        ? { ...item, high: Math.max(item.high, 103) }
        : item
    )
  });
  assert.ok(["near_miss", "forming"].includes(noFvg.status));
  assert.ok(noFvg.missingConditions.includes("fvg_detected"));
  assert.ok(noFvg.missingConditions.includes("invalidation_missing"));
  assertSafe(noFvg);

  const mock = detector.evaluateIctSessionRaidReversal({ ...base, sourceProvider: "mock" });
  assert.equal(mock.status, "rejected");
  assert.equal(mock.canCreateValidationChainEntry, false);
  assert.ok(mock.blockers.includes("source_mock_sample"));
  assertSafe(mock);

  const wrongTimeZone = detector.evaluateIctSessionRaidReversal({ ...base, timingZone: "UTC" });
  assert.notEqual(wrongTimeZone.status, "complete_bearish_reversal_candidate");
  assert.ok(wrongTimeZone.missingConditions.includes("london_expansion") || wrongTimeZone.missingConditions.includes("ny_london_high_raid"));
  assertSafe(wrongTimeZone);

  console.log(JSON.stringify({
    status: "passed",
    detector: "nasdaq_london_raid_ny_reversal_v1",
    completeStatus: narrative.status,
    stepCount: narrative.steps.length,
    rr: narrative.rr,
    sundayOpen: narrative.referenceLevels.sundayOpen?.price,
    scannerStatus: sessionOpportunity.status,
    authority: narrative.authority
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
