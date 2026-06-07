#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-activate-market-real-read-test");

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

const compactSafetyLocks = {
  rawCandlesIncluded: false,
  rawSnapshotsIncluded: false,
  secretsIncluded: false,
  accountDataIncluded: false,
  orderDataIncluded: false,
  positionDataIncluded: false
};

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of ["ictCurrentRead.ts"]) {
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
  fs.writeFileSync(
    path.join(outRoot, "ictAdvisorEngine.mjs"),
    "export async function buildIctAdvisorPacketFromRuntime() { return undefined; }\n",
    "utf8"
  );
}

const approvedDecision = (overrides = {}) => ({
  profileId: "gotrader_ict_90d_session_calibrated",
  status: "watchlist_candidate",
  researchOnly: true,
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  strategyId: "ict-fvg-displacement",
  setup: "fvg_retracement",
  side: "short",
  confidence: 0.68,
  rrEstimate: 2.1,
  compositeBias: "bearish",
  sessionNarrativeProfile: "consolidation_manipulation_distribution",
  sessionDirectionalRead: "bearish",
  sessionNarrativeConfidence: 0.72,
  fvgTargetDetected: true,
  fvgTargetDirection: "discount",
  dataDepthStatus: "sufficient",
  approvalScore: 61,
  approvedReasons: [],
  rejectionReasons: [],
  watchlistReasons: ["Research-only watchlist; requires further replay evidence."],
  authority,
  safety,
  provenance: {
    methodology: "ICT",
    profile: "gotrader_ict_90d_session_calibrated",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-07T12:00:00.000Z"
  },
  ...overrides
});

const signal = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  phase: "phase_2",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  researchOnly: true,
  side: "short",
  decision: "research_only",
  confidence: 0.68,
  bias: {
    primary: "bearish",
    htf: { "15m": "bearish", "1h": "neutral" },
    composite: "bearish"
  },
  dealingRange: {
    high: 30680,
    low: 30220,
    midpoint: 30450,
    currentLocation: "premium",
    sourceTimeframe: "15m"
  },
  liquiditySwept: {
    type: "session_high",
    price: 30670,
    timeframe: "5m",
    swept: true,
    distanceFromCurrent: 24
  },
  drawOnLiquidity: {
    type: "previous_day_low",
    price: 30320,
    timeframe: "15m",
    swept: false,
    distanceFromCurrent: 145
  },
  displacement: {
    direction: "bearish",
    candleTime: "2026-06-05T14:30:00.000Z",
    impulseHigh: 30640,
    impulseLow: 30510,
    bodySize: 84,
    createdFvg: true
  },
  fairValueGap: {
    direction: "bearish",
    high: 30580,
    low: 30542,
    midpoint: 30561,
    timeframe: "5m",
    mitigated: false,
    createdAt: "2026-06-05T14:35:00.000Z"
  },
  entryZone: {
    type: "fair_value_gap",
    high: 30580,
    low: 30542,
    midpoint: 30561
  },
  invalidation: 30682,
  target: 30320,
  rrEstimate: 2.1,
  setup: "fvg_retracement",
  summary: "CMD watchlist model with a compact FVG target.",
  noTradeReasons: [],
  riskNotes: ["Research-only; no execution authority."],
  smt: {
    divergenceType: "bearish",
    confirmsCandidate: true,
    rejectsCandidate: false,
    confidenceAdjustment: 0.04,
    relativeStrengthLeader: "US30",
    relativeWeaknessLeader: "USTECH",
    reason: "Comparison source confirms the bearish current read."
  },
  newsSessionRisk: {
    newsRiskLevel: "low",
    sessionRiskState: "clear",
    riskGovernorAction: "allow",
    confidenceAdjustment: 0,
    blockingEvents: [],
    cautionEvents: [],
    newsSessionRiskNotes: ["No blocking calendar event in compact risk context."]
  },
  sessionNarrativeProfile: "consolidation_manipulation_distribution",
  sessionDirectionalRead: "bearish",
  sessionNarrativeConfidence: 0.72,
  modelDetected: true,
  modelName: "consolidation_manipulation_distribution",
  modelState: "candidate",
  modelDirection: "bearish",
  modelConfidence: 0.72,
  modelReasons: ["Liquidity sweep and displacement sequence detected."],
  modelMissingEvidence: [],
  sessionMitigationContext: { detected: true },
  fvgTargetDetected: true,
  fvgTargetDirection: "discount",
  dataDepthStatus: "sufficient",
  availableLookbackDays: 1,
  requestedLookbackDays: 1,
  sessionTopReasons: ["CMD sequence detected in the selected session."],
  approvedProfileDecision: approvedDecision(),
  provenance: {
    methodology: "ICT",
    phase: "phase_2",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-07T12:00:00.000Z"
  },
  ...overrides
});

const sessionNarrative = (overrides = {}) => ({
  profile: "consolidation_manipulation_distribution",
  directionalRead: "bearish",
  confidence: 0.72,
  tradingDate: "2026-06-05",
  topReasons: ["Latest completed session selected from MT5 candles."],
  noTradeReasons: [],
  primaryModelDetection: {
    modelDetected: true,
    modelName: "consolidation_manipulation_distribution",
    modelState: "candidate",
    modelDirection: "bearish",
    modelConfidence: 0.72,
    modelReasons: ["Consolidation, manipulation, and displacement evidence detected."],
    missingEvidence: []
  },
  modelDetections: [],
  mitigationContext: { detected: true },
  fvgTarget: {
    detected: true,
    direction: "discount",
    targetLevel: 30320,
    note: "Discount FVG target found below current price."
  },
  dataDepth: {
    status: "sufficient",
    requestedLookbackDays: 1,
    availableLookbackDays: 1,
    candleCount: 1000,
    note: "Selected MT5 window covers the completed session."
  },
  authority,
  safety,
  ...overrides
});

const packet = (overrides = {}) => {
  const recommendedSignal = overrides.recommendedSignal ?? signal(overrides.signalOverrides);
  const narrative = overrides.sessionNarrative ?? sessionNarrative(overrides.sessionNarrativeOverrides);
  const decision = overrides.approvedProfileDecision ?? recommendedSignal.approvedProfileDecision ?? approvedDecision();
  const signals = overrides.signals ?? [
    signal({ phase: "phase_1", strategyId: "ict-htf-bias", setup: "htf_bias_only", summary: "Phase 1 HTF bias." }),
    signal({ phase: "phase_1", strategyId: "ict-daily-range", setup: "daily_range_projection", summary: "Phase 1 range." }),
    signal({ phase: "phase_2", setup: "fvg_retracement", summary: "Phase 2 FVG." }),
    recommendedSignal
  ];
  return {
    packetId: overrides.packetId ?? "activate_market_real_read_packet",
    source: "gotrader_ict_strategy_suite",
    mode: "advisory_only",
    generatedAt: "2026-06-07T12:00:00.000Z",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    activeSource: {
      provider: "mt5_read_only",
      candleCount: overrides.candleCount ?? 1000,
      firstTimestamp: "2026-06-05T00:00:00.000Z",
      lastTimestamp: "2026-06-05T20:55:00.000Z",
      sourceFingerprint: "mt5_ustech_5m_activate_real_read_fp",
      sourceLabel: "MT5 read-only USTECH 5m compact source"
    },
    signals,
    recommendedSignal,
    indexSmt: recommendedSignal.smt,
    sessionNarrative: narrative,
    compactSummary: {
      compositeBias: recommendedSignal.bias.composite,
      drawOnLiquidity: recommendedSignal.drawOnLiquidity ? `${recommendedSignal.drawOnLiquidity.type} @ ${recommendedSignal.drawOnLiquidity.price}` : undefined,
      setup: recommendedSignal.setup,
      decision: recommendedSignal.decision,
      side: recommendedSignal.side,
      confidence: recommendedSignal.confidence,
      approvedProfileStatus: decision.status,
      approvalScore: decision.approvalScore,
      smtDivergenceType: recommendedSignal.smt?.divergenceType,
      smtConfirmsCandidate: recommendedSignal.smt?.confirmsCandidate,
      smtRejectsCandidate: recommendedSignal.smt?.rejectsCandidate,
      relativeStrengthLeader: recommendedSignal.smt?.relativeStrengthLeader,
      relativeWeaknessLeader: recommendedSignal.smt?.relativeWeaknessLeader,
      newsRiskLevel: recommendedSignal.newsSessionRisk?.newsRiskLevel,
      sessionRiskState: recommendedSignal.newsSessionRisk?.sessionRiskState,
      riskGovernorAction: recommendedSignal.newsSessionRisk?.riskGovernorAction,
      newsSessionRiskNotes: recommendedSignal.newsSessionRisk?.newsSessionRiskNotes,
      sessionNarrativeProfile: narrative?.profile,
      sessionDirectionalRead: narrative?.directionalRead,
      sessionNarrativeConfidence: narrative?.confidence,
      primaryModelDetection: narrative?.primaryModelDetection,
      sessionMitigationDetected: narrative?.mitigationContext?.detected,
      fvgTargetDetected: narrative?.fvgTarget?.detected,
      fvgTargetDirection: narrative?.fvgTarget?.direction,
      sessionTopReasons: narrative?.topReasons,
      dataDepthStatus: narrative?.dataDepth?.status,
      availableLookbackDays: narrative?.dataDepth?.availableLookbackDays,
      requestedLookbackDays: narrative?.dataDepth?.requestedLookbackDays,
      hydrationSource: overrides.hydrationSource ?? "canonical_source_store",
      hydrationWarning: overrides.hydrationWarning,
      noTradeReasonCount: recommendedSignal.noTradeReasons.length
    },
    approvedProfileDecision: decision,
    journalEvents: [],
    indexSmtJournalEvents: [],
    newsSessionRisk: recommendedSignal.newsSessionRisk,
    newsSessionRiskJournalEvents: [],
    journalStatus: "memory_only",
    safetyLocks: compactSafetyLocks,
    authority,
    ...overrides.packetOverrides
  };
};

function assertNoGenericPending(read) {
  assert.notEqual(read.sessionNarrativeStatus, "pending", "session narrative should not remain pending");
  assert.notEqual(read.debug.sessionNarrativeStatus, "pending", "debug session narrative should not remain pending");
  assert.ok(read.modelDetectionStatus, "model detection status should be explicit");
  assert.ok(read.fvgTargetStatus, "FVG target status should be explicit");
  assert.ok(read.targetConstructionStatus, "target construction status should be explicit");
  assert.ok(read.invalidationConstructionStatus, "invalidation construction status should be explicit");
  assert.ok(read.rrConstructionStatus, "RR construction status should be explicit");
  assert.ok(read.smtStatus, "SMT status should be explicit");
  assert.ok(read.riskStatus, "risk status should be explicit");
  assert.ok(read.nextAction, "next action should be explicit");
}

function assertSafe(read, suite) {
  const serialized = JSON.stringify(read);
  assert.equal(read.researchOnly, true);
  assert.equal(read.executionAllowed, false);
  assert.equal(read.authority.executionAuthority, "none");
  assert.equal(read.authority.brokerAuthority, "none");
  assert.equal(read.authority.readinessOverrideAuthority, "none");
  assert.equal(read.safety.rawCandlesExcluded, true);
  assert.equal(suite.assertIctCurrentReadIsCompact(read).ok, true, "current read should be compact and safe");
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i);
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictCurrentRead.mjs")));

  const modelARead = suite.buildIctCurrentReadFromPacket(packet());
  assert.equal(modelARead.modelDetected, true, "Model A fixture should detect a model");
  assert.equal(modelARead.modelName, "consolidation_manipulation_distribution");
  assert.equal(modelARead.sessionNarrativeStatus, "consolidation_manipulation_distribution");
  assert.equal(modelARead.fvgTargetStatus, "detected");
  assert.equal(modelARead.targetConstructionStatus, "constructed");
  assert.equal(modelARead.invalidationConstructionStatus, "constructed");
  assert.equal(modelARead.rrConstructionStatus, "constructed");
  assertNoGenericPending(modelARead);
  assertSafe(modelARead, suite);

  const modelBSignal = signal({
    side: "long",
    setup: "fvg_retracement",
    bias: { primary: "bullish", htf: { "15m": "bullish", "1h": "neutral" }, composite: "bullish" },
    sessionNarrativeProfile: "ny_session_reversal_to_premium_fvg",
    sessionDirectionalRead: "bullish",
    modelName: "ny_session_reversal_to_premium_fvg",
    modelDirection: "bullish",
    target: 30620,
    invalidation: 30390,
    rrEstimate: 2.4,
    fvgTargetDetected: true,
    fvgTargetDirection: "premium",
    summary: "NY reversal to premium FVG."
  });
  const modelBRead = suite.buildIctCurrentReadFromPacket(packet({
    recommendedSignal: modelBSignal,
    sessionNarrative: sessionNarrative({
      profile: "ny_session_reversal_to_premium_fvg",
      directionalRead: "bullish",
      primaryModelDetection: {
        modelDetected: true,
        modelName: "ny_session_reversal_to_premium_fvg",
        modelState: "candidate",
        modelDirection: "bullish",
        modelConfidence: 0.69,
        modelReasons: ["NY reversal and premium FVG objective detected."],
        missingEvidence: []
      },
      fvgTarget: {
        detected: true,
        direction: "premium",
        targetLevel: 30620,
        note: "Premium FVG target found above current price."
      }
    })
  }));
  assert.equal(modelBRead.modelDetected, true, "Model B fixture should detect a model");
  assert.equal(modelBRead.modelName, "ny_session_reversal_to_premium_fvg");
  assert.equal(modelBRead.fvgTargetDetected, true, "Model B should expose FVG target");
  assert.equal(modelBRead.fvgTargetStatus, "detected");
  assertNoGenericPending(modelBRead);
  assertSafe(modelBRead, suite);

  const closedRead = suite.buildIctCurrentReadFromPacket(packet({
    sessionNarrative: sessionNarrative({
      tradingDate: "2026-06-05",
      topReasons: ["Market closed; reviewing latest completed MT5 session."]
    })
  }));
  assert.equal(closedRead.debug.selectedSessionDate, "2026-06-05");
  assert.match(closedRead.debug.selectedSessionMode, /latest_completed_or_current_session/i);
  assertNoGenericPending(closedRead);

  const noModelSignal = signal({
    side: "flat",
    decision: "no_trade",
    confidence: 0.18,
    setup: "htf_bias_only",
    target: undefined,
    invalidation: undefined,
    rrEstimate: undefined,
    fairValueGap: undefined,
    entryZone: undefined,
    modelDetected: false,
    modelName: undefined,
    modelMissingEvidence: ["No sweep/displacement sequence confirmed."],
    fvgTargetDetected: false,
    noTradeReasons: ["No model exists in the selected session window."],
    summary: "Low-probability session; no model detected."
  });
  const noModelRead = suite.buildIctCurrentReadFromPacket(packet({
    recommendedSignal: noModelSignal,
    approvedProfileDecision: approvedDecision({ status: "no_trade", approvalScore: 0, rejectionReasons: ["No model exists in the selected session window."], watchlistReasons: [] }),
    sessionNarrative: sessionNarrative({
      profile: "low_probability",
      directionalRead: "flat",
      confidence: 0.12,
      primaryModelDetection: {
        modelDetected: false,
        modelName: undefined,
        modelState: "not_present",
        modelDirection: "flat",
        modelConfidence: 0,
        modelReasons: ["No model exists in the selected session window."],
        missingEvidence: ["No sweep/displacement sequence confirmed."]
      },
      fvgTarget: { detected: false, direction: "unknown", note: "No premium/discount FVG target found in the selected session." }
    })
  }));
  assert.equal(noModelRead.sessionNarrativeStatus, "low_probability");
  assert.equal(noModelRead.modelDetected, false);
  assert.equal(noModelRead.modelDetectionStatus, "not_detected");
  assert.notEqual(noModelRead.sessionNarrativeStatus, "pending");
  assert.match(noModelRead.topReasons.join(" "), /No model exists|No sweep/i);
  assertSafe(noModelRead, suite);

  const missingFvgRead = suite.buildIctCurrentReadFromPacket(packet({
    recommendedSignal: signal({
      fairValueGap: undefined,
      target: undefined,
      rrEstimate: undefined,
      fvgTargetDetected: false,
      noTradeReasons: ["FVG target missing; no clean premium/discount objective found."]
    }),
    sessionNarrative: sessionNarrative({
      fvgTarget: {
        detected: false,
        direction: "unknown",
        note: "No FVG target found; price did not leave an unmitigated premium/discount gap."
      }
    })
  }));
  assert.equal(missingFvgRead.fvgTargetStatus, "missing");
  assert.match(missingFvgRead.fvgTargetReason, /No FVG target|premium\/discount/i);
  assert.equal(missingFvgRead.targetConstructionStatus, "missing");
  assert.match(missingFvgRead.targetConstructionReason, /FVG target|liquidity target|no target/i);
  assert.equal(missingFvgRead.rrConstructionStatus, "missing");
  assert.match(missingFvgRead.rrConstructionReason, /RR/i);
  assertSafe(missingFvgRead, suite);

  const missingContextRead = suite.buildIctCurrentReadFromPacket(packet({
    recommendedSignal: signal({
      smt: undefined,
      newsSessionRisk: undefined
    }),
    sessionNarrative: sessionNarrative()
  }));
  assert.equal(missingContextRead.smtStatus, "comparison_sources_missing");
  assert.match(missingContextRead.smtReason, /comparison source/i);
  assert.equal(missingContextRead.riskStatus, "unknown_no_calendar");
  assert.match(missingContextRead.riskReason, /news\/session calendar/i);
  assertSafe(missingContextRead, suite);

  const missingFieldsRead = suite.buildIctCurrentReadFromPacket(packet({
    recommendedSignal: signal({
      target: undefined,
      invalidation: undefined,
      rrEstimate: undefined,
      noTradeReasons: ["No structural invalidation and no liquidity target can be constructed."]
    })
  }));
  assert.equal(missingFieldsRead.targetConstructionStatus, "missing");
  assert.equal(missingFieldsRead.invalidationConstructionStatus, "missing");
  assert.equal(missingFieldsRead.rrConstructionStatus, "missing");
  assert.match(missingFieldsRead.targetConstructionReason, /target/i);
  assert.match(missingFieldsRead.invalidationConstructionReason, /invalidation/i);
  assert.match(missingFieldsRead.rrConstructionReason, /RR/i);
  assertSafe(missingFieldsRead, suite);

  console.log(JSON.stringify({
    status: "passed",
    tested: [
      "model_a_detected",
      "model_b_fvg_target",
      "market_closed_last_completed_session",
      "low_probability_not_pending",
      "missing_fvg_reason",
      "missing_smt_comparison_sources",
      "missing_news_calendar_unknown",
      "target_invalidation_rr_reasons",
      "compact_safety"
    ],
    authority,
    rawCandlesExposed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
