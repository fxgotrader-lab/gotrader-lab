#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-session-narrative-test");
const sourceFiles = [
  "ictStrategySuiteTypes.ts",
  "ictAdvisorTypes.ts",
  "ictSessionNarrativeTypes.ts",
  "ictStrategySuiteHelpers.ts",
  "ictSessionNarrative.ts",
  "ictApprovedSetupProfileTypes.ts",
  "ictReplayValidationTypes.ts",
  "ictIndexSmtTypes.ts",
  "ictNewsSessionRiskTypes.ts",
  "ictApprovedSetupProfile.ts",
  "index.ts"
];

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceRoot, file);
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
      .replace(/from\s+"..\/types"/g, 'from "./typesStub.mjs"')
      .replace(/from\s+'..\/types'/g, "from './typesStub.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
  fs.writeFileSync(path.join(outRoot, "typesStub.mjs"), "export {};\n", "utf8");
}

const isoNy = (localDate, hhmm) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  const [year, month, day] = localDate.split("-").map(Number);
  // The fixture date is June 2026, so America/New_York is UTC-4.
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0)).toISOString();
};

const candle = (id, localDate, hhmm, open, high, low, close) => ({
  id,
  symbol: "MNQ",
  timeframe: "15m",
  timestamp: isoNy(localDate, hhmm),
  open,
  high,
  low,
  close,
  volume: 1000
});

const fixture = [
  candle("asia_0", "2026-06-04", "20:00", 100, 103, 96, 101),
  candle("asia_1", "2026-06-04", "20:15", 101, 104, 94, 98),
  candle("asia_2", "2026-06-04", "20:30", 98, 102, 92, 95),
  candle("asia_3", "2026-06-04", "21:00", 95, 101, 90, 97),
  candle("asia_4", "2026-06-04", "22:00", 97, 105, 91, 104),
  candle("asia_5", "2026-06-04", "23:45", 104, 106, 95, 99),
  candle("midnight", "2026-06-05", "00:00", 100, 101, 98, 99),
  candle("london_0", "2026-06-05", "02:00", 99, 101, 91, 95),
  candle("london_1", "2026-06-05", "02:15", 95, 100, 90.8, 96),
  candle("london_2", "2026-06-05", "02:30", 96, 102, 91.2, 101),
  candle("london_3", "2026-06-05", "03:00", 101, 104, 94, 103),
  candle("manip_0", "2026-06-05", "04:15", 103, 107, 98, 106),
  candle("manip_1", "2026-06-05", "04:30", 106, 109, 99, 101),
  candle("manip_2", "2026-06-05", "05:00", 101, 108, 97, 105),
  candle("pre_ny", "2026-06-05", "08:45", 105, 106, 99, 100),
  candle("ny_0", "2026-06-05", "09:30", 100, 105, 96, 98),
  candle("ny_1", "2026-06-05", "09:45", 98, 101, 88, 90),
  candle("ny_2", "2026-06-05", "10:00", 90, 92, 82, 85),
  candle("ny_3", "2026-06-05", "10:15", 85, 87, 78, 80)
];

function baseSignal(overrides = {}) {
  return {
    strategyId: "ict-fvg-displacement",
    phase: "phase_1",
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "15m",
    htfTimeframes: ["15m", "1h"],
    side: "short",
    decision: "research_only",
    confidence: 0.76,
    bias: { primary: "bearish", htf: { "15m": "bearish", "1h": "bearish" }, composite: "bearish" },
    dealingRange: { high: 109, low: 78, midpoint: 93.5, currentLocation: "premium", sourceTimeframe: "15m" },
    liquiditySwept: { type: "equal_highs", price: 106, timeframe: "15m", swept: true, distanceFromCurrent: 26 },
    drawOnLiquidity: { type: "previous_day_low", price: 78, timeframe: "daily", swept: false, distanceFromCurrent: -2 },
    displacement: { direction: "bearish", candleTime: isoNy("2026-06-05", "09:45"), impulseHigh: 101, impulseLow: 88, bodySize: 8, createdFvg: true },
    fairValueGap: { direction: "bearish", high: 99, low: 96, midpoint: 97.5, timeframe: "15m", mitigated: false, createdAt: isoNy("2026-06-05", "09:45") },
    entryZone: { type: "fair_value_gap", high: 99, low: 96, midpoint: 97.5 },
    invalidation: 110,
    target: 78,
    rrEstimate: 2.1,
    setup: "fvg_retracement",
    summary: "Synthetic bearish FVG setup.",
    noTradeReasons: [],
    riskNotes: ["Research-only. No broker execution authority."],
    provenance: {
      methodology: "ICT",
      phase: "phase_1",
      sourceSet: "ICT Mentorship Core Content",
      researchOnly: true,
      generatedAt: new Date().toISOString()
    },
    ...overrides
  };
}

async function main() {
  compileSuiteForNode();
  const narrativeModule = await import(pathToFileURL(path.join(outRoot, "ictSessionNarrative.mjs")));
  const approvedModule = await import(pathToFileURL(path.join(outRoot, "ictApprovedSetupProfile.mjs")));
  const suite = { ...narrativeModule, ...approvedModule };
  const narrative = suite.buildIctSessionNarrative(fixture, {
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "15m",
    requestedLookbackDays: 90
  });

  assert.equal(narrative.profile, "consolidation_manipulation_distribution");
  assert.equal(narrative.directionalRead, "bearish");
  assert.equal(narrative.mitigationContext.detected, true);
  assert.ok(narrative.events.some((event) => event.eventType === "london_equal_lows"));
  assert.ok(narrative.events.some((event) => event.eventType === "buyside_sweep"));
  assert.ok(narrative.events.some((event) => event.eventType === "ny_open_mitigation"));
  assert.ok(narrative.events.some((event) => event.eventType === "bearish_expansion"));
  assert.equal(suite.assertIctSessionNarrativeIsCompact(narrative).ok, true);

  const profile = suite.getDefaultApprovedSetupProfiles()[1];
  const supportiveSignal = baseSignal({
    sessionNarrativeProfile: narrative.profile,
    sessionDirectionalRead: narrative.directionalRead,
    sessionNarrativeConfidence: narrative.confidence,
    sessionMitigationContext: narrative.mitigationContext,
    dataDepthStatus: narrative.dataDepth.status,
    sessionTopReasons: narrative.topReasons
  });
  const supportiveDecision = suite.evaluateApprovedSetupProfile(supportiveSignal, profile);
  assert.ok(supportiveDecision.approvedReasons.some((reason) => /Session narrative confirms/i.test(reason)));

  const contradictingDecision = suite.evaluateApprovedSetupProfile(
    baseSignal({
      side: "long",
      bias: { primary: "bullish", htf: { "15m": "bullish", "1h": "bullish" }, composite: "bullish" },
      displacement: { direction: "bullish", candleTime: isoNy("2026-06-05", "09:45"), impulseHigh: 101, impulseLow: 88, bodySize: 8, createdFvg: true },
      fairValueGap: { direction: "bullish", high: 99, low: 96, midpoint: 97.5, timeframe: "15m", mitigated: false, createdAt: isoNy("2026-06-05", "09:45") },
      liquiditySwept: { type: "equal_lows", price: 90, timeframe: "15m", swept: true, distanceFromCurrent: -10 },
      drawOnLiquidity: { type: "previous_day_high", price: 110, timeframe: "daily", swept: false, distanceFromCurrent: 30 },
      sessionNarrativeProfile: narrative.profile,
      sessionDirectionalRead: narrative.directionalRead,
      sessionNarrativeConfidence: narrative.confidence,
      sessionMitigationContext: narrative.mitigationContext,
      dataDepthStatus: "sufficient",
      rrEstimate: 2.1
    }),
    profile
  );
  assert.ok(
    contradictingDecision.watchlistReasons.some((reason) => /Session narrative bearish read conflicts with long candidate/i.test(reason)),
    "opposite-side candidate should be downgraded to watchlist by session narrative"
  );

  console.log(
    JSON.stringify(
      {
        status: "passed",
        profile: narrative.profile,
        directionalRead: narrative.directionalRead,
        mitigationDetected: narrative.mitigationContext.detected,
        dataDepthStatus: narrative.dataDepth.status,
        eventTypes: narrative.events.map((event) => event.eventType),
        compactBytes: suite.assertIctSessionNarrativeIsCompact(narrative).serializedBytes
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
