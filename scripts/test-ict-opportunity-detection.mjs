#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-opportunity-detection-test");

const sourceFiles = [
  "ictOpportunityDetectionTypes.ts",
  "ictOpportunityDetection.ts"
];

function compileForNode() {
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

const event = (eventType, overrides = {}) => ({
  eventType,
  timestamp: "2026-06-07T13:00:00.000Z",
  localTime: "09:00",
  price: 30420,
  confidence: 0.72,
  note: `${eventType} test event`,
  ...overrides
});

const narrative = (overrides = {}) => ({
  researchOnly: true,
  profile: "unknown",
  directionalRead: "neutral",
  confidence: 0.62,
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  timingZone: "America/New_York",
  sourceTimestampZone: "UTC",
  tradingDate: "2026-06-07",
  midnightOpen: {
    timestamp: "2026-06-07T04:00:00.000Z",
    localTime: "00:00",
    price: 30400
  },
  sundayOpen: {
    timestamp: "2026-06-07T22:00:00.000Z",
    localTime: "18:00",
    price: 30320
  },
  activeDealingRange: {
    high: 30550,
    low: 30250,
    midpoint: 30400,
    currentLocation: "premium",
    referencePrice: 30475
  },
  ranges: [],
  events: [],
  modelDetections: [],
  mitigationContext: {
    detected: false,
    note: "No mitigation context."
  },
  dataDepth: {
    requestedLookbackDays: 90,
    availableLookbackDays: 88.95,
    status: "sufficient",
    candleCount: 17799,
    source: "cached_depth",
    note: "90-day compact depth is sufficient."
  },
  topReasons: ["Test compact narrative."],
  noTradeReasons: [],
  summary: "Test compact narrative.",
  authority,
  safety,
  ...overrides
});

const signal = (overrides = {}) => ({
  strategyId: "ict-test",
  phase: "phase_2",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  side: "short",
  decision: "research_only",
  confidence: 0.68,
  bias: {
    primary: "bearish",
    htf: "bearish",
    composite: "bearish"
  },
  dealingRange: {
    high: 30550,
    low: 30250,
    midpoint: 30400,
    currentLocation: "premium",
    sourceTimeframe: "1h"
  },
  drawOnLiquidity: {
    type: "old_swing_low",
    price: 30240,
    timeframe: "15m",
    swept: false,
    distanceFromCurrent: 160
  },
  displacement: {
    direction: "bearish",
    candleTime: "2026-06-07T13:05:00.000Z",
    impulseHigh: 30510,
    impulseLow: 30340,
    bodySize: 120,
    createdFvg: true
  },
  fairValueGap: {
    direction: "bearish",
    high: 30480,
    low: 30435,
    midpoint: 30457.5,
    timeframe: "5m",
    mitigated: false,
    createdAt: "2026-06-07T13:05:00.000Z"
  },
  entryZone: {
    type: "fair_value_gap",
    high: 30480,
    low: 30435,
    midpoint: 30457.5
  },
  target: 30240,
  invalidation: 30520,
  rrEstimate: 2.4,
  setup: "breaker_retest",
  summary: "Test compact signal.",
  noTradeReasons: [],
  riskNotes: [],
  researchOnly: true,
  authority,
  ...overrides
});

const packet = (sessionNarrative, recommendedSignal, status = "watchlist_candidate") => ({
  packetId: "ict_opportunity_test_packet",
  generatedAt: "2026-06-07T14:00:00.000Z",
  activeSource: {
    provider: "mt5_read_only",
    candleCount: 1000,
    sourceFingerprint: "mt5_ustech_5m_test_fp"
  },
  sessionNarrative,
  recommendedSignal,
  approvedProfileDecision: {
    status,
    rejectionReasons: status === "rejected_candidate" ? ["Approved-profile layer rejected test setup."] : [],
    watchlistReasons: ["Needs replay validation."]
  }
});

function detectOne(suite, narrativeOverrides, signalOverrides = {}, status = "watchlist_candidate") {
  const nextNarrative = narrative(narrativeOverrides);
  const nextSignal = signal(signalOverrides);
  return suite.detectIctOpportunities({
    packet: packet(nextNarrative, nextSignal, status),
    sessionNarrative: nextNarrative,
    recommendedSignal: nextSignal,
    approvedStatus: status,
    sourceFingerprint: "mt5_ustech_5m_test_fp"
  })[0];
}

function assertSafe(suite, opportunity) {
  const compact = suite.assertIctDetectedOpportunityIsCompact(opportunity);
  assert.equal(compact.ok, true, "opportunity must stay compact and safe");
  assert.equal(opportunity.researchOnly, true);
  assert.equal(opportunity.authority.executionAuthority, "none");
  assert.equal(opportunity.authority.brokerAuthority, "none");
  assert.equal(opportunity.authority.readinessOverrideAuthority, "none");
  assert.equal(opportunity.safety.rawCandlesExcluded, true);
  assert.doesNotMatch(JSON.stringify(opportunity), /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictOpportunityDetection.mjs")));

  const liquidityRaid = detectOne(suite, {
    events: [event("buyside_sweep")],
    directionalRead: "bearish"
  });
  assert.equal(liquidityRaid.type, "liquidity_raid");
  assertSafe(suite, liquidityRaid);

  const nyReversal = detectOne(suite, {
    profile: "ny_session_reversal_to_premium_fvg",
    directionalRead: "bearish",
    primaryModelDetection: {
      modelDetected: true,
      modelName: "ny_session_reversal_to_premium_fvg",
      modelState: "triggered",
      modelDirection: "bearish",
      modelConfidence: 0.71,
      modelReasons: ["NY reversal test."],
      missingEvidence: [],
      supportingEventTypes: ["ny_reversal_higher"]
    },
    events: [event("ny_reversal_higher"), event("premium_fvg_target")]
  });
  assert.equal(nyReversal.type, "session_reversal");
  assert.equal(nyReversal.stage, "confirmed");
  assertSafe(suite, nyReversal);

  const retracement = detectOne(suite, {
    mitigationContext: {
      detected: true,
      direction: "bearish",
      sourceSession: "london",
      sourceLabel: "London mitigation",
      zoneHigh: 30480,
      zoneLow: 30435,
      expansionConfirmed: false,
      note: "Mitigation tap test."
    }
  });
  assert.equal(retracement.type, "mitigation_reaction");
  assertSafe(suite, retracement);

  const expansion = detectOne(suite, {
    profile: "consolidation_manipulation_distribution",
    directionalRead: "bearish",
    primaryModelDetection: {
      modelDetected: true,
      modelName: "consolidation_manipulation_distribution",
      modelState: "confirmed",
      modelDirection: "bearish",
      modelConfidence: 0.78,
      modelReasons: ["CMD expansion test."],
      missingEvidence: [],
      supportingEventTypes: ["bearish_expansion"]
    },
    events: [event("london_compression"), event("bearish_expansion")]
  }, {}, "paper_watchlist_candidate");
  assert.equal(expansion.type, "expansion_from_consolidation");
  assert.equal(expansion.laneRecommendation, "paper_watchlist_candidate");
  assertSafe(suite, expansion);

  const fvgDraw = detectOne(suite, {
    events: [event("premium_fvg_target")],
    fvgTarget: {
      detected: true,
      direction: "premium",
      high: 30550,
      low: 30505,
      midpoint: 30527.5,
      note: "Premium FVG draw target test."
    }
  });
  assert.equal(fvgDraw.type, "fvg_draw");
  assertSafe(suite, fvgDraw);

  const unknown = detectOne(suite, {
    events: [event("midnight_open_rejection")],
    profile: "unknown",
    primaryModelDetection: undefined
  }, { target: undefined, invalidation: undefined, rrEstimate: undefined });
  assert.equal(unknown.type, "unknown_structured_opportunity");
  assert.equal(unknown.laneRecommendation, "watchlist_candidate");
  assert.match(unknown.nextAction, /research hypothesis/i);
  assertSafe(suite, unknown);

  const missingTradeIdea = detectOne(suite, {
    profile: "consolidation_manipulation_distribution",
    primaryModelDetection: {
      modelDetected: true,
      modelName: "consolidation_manipulation_distribution",
      modelState: "triggered",
      modelDirection: "bearish",
      modelConfidence: 0.65,
      modelReasons: ["Needs trade idea test."],
      missingEvidence: [],
      supportingEventTypes: ["bearish_expansion"]
    },
    events: [event("bearish_expansion")]
  }, { target: undefined, invalidation: undefined, rrEstimate: undefined }, "approved_research_candidate");
  assert.notEqual(missingTradeIdea.laneRecommendation, "approved_candidate", "missing target/invalidation/RR cannot become approved");
  assert.notEqual(missingTradeIdea.laneRecommendation, "paper_watchlist_candidate", "missing target/invalidation/RR cannot become paper-watchlist");
  assertSafe(suite, missingTradeIdea);

  const rangeBound = detectOne(suite, {
    profile: "range_bound",
    directionalRead: "neutral",
    events: [event("ny_preopen_consolidation")]
  }, { side: "flat", target: undefined, invalidation: undefined, rrEstimate: undefined });
  assert.equal(rangeBound.type, "range_liquidity_sweep");
  assert.ok(["low", "untradable"].includes(rangeBound.quality));
  assert.notEqual(rangeBound.laneRecommendation, "approved_candidate");
  assertSafe(suite, rangeBound);

  const noData = suite.detectIctOpportunities({})[0];
  assert.equal(noData.type, "none");
  assert.equal(noData.stage, "insufficient_data");
  assertSafe(suite, noData);

  process.stdout.write("ICT opportunity detection test passed.\n");
  process.stdout.write(JSON.stringify({
    tested: [
      "liquidity_raid",
      "ny_reversal",
      "retracement_to_pd_array_or_mitigation",
      "expansion_from_consolidation",
      "fvg_draw",
      "unknown_structured_opportunity",
      "missing_trade_idea_downgrade",
      "range_bound_low_quality",
      "safe_no_data"
    ],
    authority,
    rawCandlesExposed: false
  }, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`ICT opportunity detection test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
