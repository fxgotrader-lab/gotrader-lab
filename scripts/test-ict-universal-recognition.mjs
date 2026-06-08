#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-universal-recognition-test");

const sourceFiles = [
  "ictUniversalRecognitionTypes.ts",
  "ictUniversalRecognition.ts",
  "ictSelfImprovementTypes.ts",
  "ictSelfImprovement.ts"
];

function compileForNode() {
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

const baseEvent = (eventType, overrides = {}) => ({
  eventType,
  timestamp: "2026-06-08T13:30:00.000Z",
  localTime: "09:30",
  confidence: 0.72,
  note: `${eventType} fixture`,
  ...overrides
});

const baseNarrative = (overrides = {}) => ({
  researchOnly: true,
  profile: "unknown",
  directionalRead: "neutral",
  confidence: 0.42,
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  timingZone: "America/New_York",
  sourceTimestampZone: "UTC",
  ranges: [],
  events: [baseEvent("midnight_open", { price: 50800 })],
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
    note: "90-day compact depth sufficient."
  },
  topReasons: [],
  noTradeReasons: [],
  summary: "Fixture narrative.",
  authority,
  safety,
  ...overrides
});

const baseSignal = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  phase: "phase_1",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  researchOnly: true,
  side: "flat",
  decision: "no_trade",
  confidence: 0.3,
  bias: {
    primary: "neutral",
    htf: {},
    composite: "neutral"
  },
  setup: "no_trade",
  summary: "Fixture signal.",
  noTradeReasons: [],
  riskNotes: ["Research-only fixture."],
  provenance: {
    methodology: "ICT",
    phase: "phase_1",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-08T14:00:00.000Z"
  },
  ...overrides
});

const basePacket = (overrides = {}) => ({
  packetId: "ict_universal_packet_fixture",
  generatedAt: "2026-06-08T14:00:00.000Z",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  activeSource: {
    provider: "mt5_read_only",
    candleCount: 1000,
    sourceFingerprint: "mt5_universal_fixture",
    sourceLabel: "MT5 read-only fixture"
  },
  recommendedSignal: baseSignal(),
  sessionNarrative: baseNarrative(),
  compactSummary: {},
  approvedProfileDecision: {
    status: "no_trade"
  },
  ...overrides
});

function assertSafe(result) {
  assert.equal(result.researchOnly, true);
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");
  assert.equal(result.safety.rawCandlesExcluded, true);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
}

compileForNode();
const suite = await import(pathToFileURL(path.join(outRoot, "ictUniversalRecognition.mjs")));
const selfImprovement = await import(pathToFileURL(path.join(outRoot, "ictSelfImprovement.mjs")));

const fullModelPacket = basePacket({
  sessionNarrative: baseNarrative({
    profile: "consolidation_manipulation_distribution",
    directionalRead: "bearish",
    primaryModelDetection: {
      modelDetected: true,
      modelName: "consolidation_manipulation_distribution",
      modelState: "confirmed",
      modelDirection: "bearish",
      modelConfidence: 0.82,
      modelReasons: ["Asia consolidation, London manipulation, NY distribution confirmed."],
      missingEvidence: [],
      supportingEventTypes: ["london_swept_asia_high", "bearish_expansion"]
    },
    modelDetections: [],
    events: [baseEvent("london_swept_asia_high", { direction: "bearish" }), baseEvent("bearish_expansion", { direction: "bearish" })],
    fvgTarget: {
      detected: true,
      direction: "discount",
      high: 50620,
      low: 50580,
      midpoint: 50600,
      note: "Discount FVG target detected."
    }
  }),
  recommendedSignal: baseSignal({
    side: "short",
    decision: "research_only",
    target: 50580,
    invalidation: 50880,
    rrEstimate: 1.7,
    confidence: 0.7,
    fairValueGap: {
      direction: "bearish",
      high: 50780,
      low: 50720,
      midpoint: 50750,
      timeframe: "5m",
      mitigated: false,
      createdAt: "2026-06-08T13:35:00.000Z"
    },
    displacement: {
      direction: "bearish",
      candleTime: "2026-06-08T13:35:00.000Z",
      impulseHigh: 50840,
      impulseLow: 50700,
      bodySize: 120,
      createdFvg: true
    }
  })
});
const fullModel = suite.buildIctUniversalRecognition({ packet: fullModelPacket });
assert.equal(fullModel.tier, "full_model", "full known model should outrank scalp fallback");
assert.equal(fullModel.laneRecommendation, "watchlist_candidate", "full recognition does not auto-approve without approved profile status");
assertSafe(fullModel);

const forming = suite.buildIctUniversalRecognition({
  packet: basePacket({
    sessionNarrative: baseNarrative({
      profile: "consolidation_manipulation_distribution",
      directionalRead: "bearish",
      primaryModelDetection: {
        modelDetected: false,
        modelName: "consolidation_manipulation_distribution",
        modelState: "forming",
        modelDirection: "bearish",
        modelConfidence: 0.58,
        modelReasons: ["Consolidation profile forming."],
        missingEvidence: ["NY distribution expansion missing."],
        supportingEventTypes: ["london_compression"]
      },
      modelDetections: []
    })
  })
});
assert.equal(forming.tier, "forming_model", "forming known model should outrank PD/scalp fallback");

const pdArray = suite.buildIctUniversalRecognition({
  packet: basePacket({
    sessionNarrative: baseNarrative({
      activeDealingRange: {
        high: 50900,
        low: 50500,
        midpoint: 50700,
        currentLocation: "discount",
        referencePrice: 50620
      },
      fvgTarget: {
        detected: true,
        direction: "premium",
        high: 50840,
        low: 50800,
        midpoint: 50820,
        note: "Premium FVG draw detected."
      }
    })
  })
});
assert.equal(pdArray.tier, "pd_array_setup", "PD-array setup should be reported when no full model exists");
assert.ok(pdArray.pdArrays.length >= 2, "PD-array recognition should collect compact arrays");

const scalp = suite.buildIctUniversalRecognition({
  packet: basePacket({
    sessionNarrative: baseNarrative({
      directionalRead: "bullish",
      events: [
        baseEvent("sellside_sweep", { direction: "bullish", low: 50600 }),
        baseEvent("bullish_expansion", { direction: "bullish", high: 50840 })
      ]
    }),
    recommendedSignal: baseSignal({
      side: "long",
      decision: "research_only",
      target: 50920,
      invalidation: 50580,
      rrEstimate: 1.8,
      confidence: 0.64,
      drawOnLiquidity: {
        type: "session_high",
        price: 50920,
        timeframe: "5m",
        swept: false,
        distanceFromCurrent: 160
      },
      liquiditySwept: {
        type: "session_low",
        price: 50600,
        timeframe: "5m",
        swept: true,
        distanceFromCurrent: 60
      },
      displacement: {
        direction: "bullish",
        candleTime: "2026-06-08T13:40:00.000Z",
        impulseHigh: 50820,
        impulseLow: 50610,
        bodySize: 140,
        createdFvg: true
      },
      fairValueGap: {
        direction: "bullish",
        high: 50780,
        low: 50720,
        midpoint: 50750,
        timeframe: "5m",
        mitigated: false,
        createdAt: "2026-06-08T13:40:00.000Z"
      },
      entryZone: {
        type: "fair_value_gap",
        high: 50780,
        low: 50720,
        midpoint: 50750
      }
    })
  })
});
assert.equal(scalp.tier, "scalp_setup", "scalp fallback should appear when sweep/displacement/PD context exists");
assert.equal(scalp.scalpOpportunity.status, "scalp_candidate");
assert.notEqual(scalp.laneRecommendation, "approved_candidate", "scalp fallback must not auto-approve");
assert.equal(scalp.scalpOpportunity.target, 50920);
assert.equal(scalp.scalpOpportunity.invalidation, 50580);
assert.equal(scalp.scalpOpportunity.rrEstimate, 1.8);
assertSafe(scalp);

const scalpWatchlist = suite.buildIctUniversalRecognition({
  packet: basePacket({
    sessionNarrative: baseNarrative({
      events: [baseEvent("sellside_sweep", { direction: "bullish", low: 50600 })],
      activeDealingRange: {
        high: 50900,
        low: 50500,
        midpoint: 50700,
        currentLocation: "discount",
        referencePrice: 50620
      }
    })
  })
});
assert.equal(scalpWatchlist.scalpOpportunity.status, "scalp_watchlist", "partial scalp structure should be watchlist, not approved");

const marketMap = suite.buildIctUniversalRecognition({
  packet: basePacket({
    sessionNarrative: baseNarrative({
      events: [baseEvent("midnight_open", { price: 50700 })],
      ranges: []
    })
  })
});
assert.equal(marketMap.tier, "market_map_only", "context-only read should return market map");

const insufficient = suite.buildIctUniversalRecognition();
assert.equal(insufficient.tier, "insufficient_data", "missing input should be explicit insufficient data");
assertSafe(insufficient);

const hypothesisResult = selfImprovement.buildIctResearchHypothesisFromOpportunity({
  opportunity: {
    researchOnly: true,
    opportunityId: "ict_universal_scalp_hypothesis_fixture",
    generatedAt: "2026-06-08T14:05:00.000Z",
    type: "liquidity_raid",
    stage: "forming",
    quality: "medium",
    modelFamily: "ICT",
    direction: "bullish",
    marketCycleStage: "reversal",
    tradeIdea: {
      side: "long",
      target: 50920,
      invalidation: 50580,
      rrEstimate: 1.8,
      confidence: 0.64
    },
    confirmationNeeded: ["Replay validation missing."],
    missingEvidence: ["Scalp model is unvalidated."],
    blockers: ["No approved model contract for scalp fallback."],
    laneRecommendation: "watchlist_candidate",
    nextAction: "Queue research hypothesis; validate with replay.",
    authority,
    safety
  },
  approvedStatus: "watchlist_candidate",
  modelQualityLane: "watchlist",
  dataStatus: "ready",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  sourceFingerprint: "mt5_universal_fixture",
  candleCount: 1000,
  topReasons: ["Universal scalp fallback found an unvalidated setup."],
  generatedAt: "2026-06-08T14:05:00.000Z"
});
assert.equal(hypothesisResult.ok, true, "unvalidated scalp setup should be eligible for research hypothesis");
assert.equal(hypothesisResult.hypothesis.autoPromoteAllowed, false);
assert.equal(hypothesisResult.hypothesis.executionAllowed, false);
assert.equal(hypothesisResult.hypothesis.authority.executionAuthority, "none");

const report = {
  status: "passed",
  cases: {
    fullModelTier: fullModel.tier,
    formingTier: forming.tier,
    pdArrayTier: pdArray.tier,
    scalpTier: scalp.tier,
    scalpStatus: scalp.scalpOpportunity.status,
    marketMapTier: marketMap.tier,
    insufficientTier: insufficient.tier,
    hypothesisQueued: hypothesisResult.ok
  },
  safety: {
    rawCandlesExcluded: true,
    authority
  }
};

console.log(JSON.stringify(report, null, 2));
