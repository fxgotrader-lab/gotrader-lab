#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "research-advisor-decision-audit-test");
const sourceFiles = [
  "ictResearchAdvisorDecisionExplanationTypes.ts",
  "ictResearchAdvisorDecisionExplanation.ts"
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
    fs.writeFileSync(
      path.join(outRoot, file.replace(/\.ts$/, ".mjs")),
      transpiled.replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"'),
      "utf8"
    );
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

function baseCurrentRead(overrides = {}) {
  return {
    researchOnly: true,
    packetSource: "live_mt5",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    displayTimeframe: "15m",
    displayTimeframeRole: "chart_display_reference_only",
    analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
    analysisTimeframesLoaded: ["W1", "D1", "H4", "H1", "M15", "M5"],
    requiredTimeframesLoaded: true,
    analysisTimeframesUsed: ["W1", "D1", "H4", "H1", "M15", "M5"],
    analysisDepthStatus: "sufficient",
    multiTimeframeContextStatus: "built",
    missingTimeframes: [],
    htfBiasSource: ["W1", "D1", "H4", "H1"],
    sessionModelSourceTimeframe: "M15",
    confirmationSourceTimeframe: "M5",
    weeklyBiasStatus: "loaded",
    weeklyBiasDirection: "bullish",
    weeklyBiasReason: "Derived from D1 90-day read-only history.",
    htfTimeframes: ["15m", "1h"],
    dataStatus: "ready",
    candleCount: 1000,
    side: "flat",
    approvedStatus: "rejected_candidate",
    modelQualityLane: "rejected",
    paperWatchlistEligible: false,
    paperWatchlistReason: "Approved-profile layer rejected the current read.",
    paperWatchlistEvidenceSummary: "Target, invalidation, and RR are missing.",
    paperSimEligibilityStatus: "not_eligible",
    paperSimEligibilityReason: "Only approved research signals or explicit paper-watchlist candidates are eligible.",
    paperSimAllowed: false,
    paperOnly: false,
    readinessSummary: {
      researchReadiness: "partial",
      paperReadiness: "not_eligible",
      executionReadiness: "disabled",
      reasons: ["target, invalidation, and RR are missing."]
    },
    executionAllowed: false,
    approvalScore: 0,
    confidence: 0,
    bias: "neutral",
    smtStatus: "insufficient_data",
    riskStatus: "clear",
    latestMonteCarloStatus: "missing",
    latestMonteCarloReason: "no replay/paper outcome sample yet.",
    recommendedMaxRiskStatus: "unavailable",
    recommendedMaxRiskReason: "Monte Carlo not saved.",
    sessionNarrativeProfile: "range_bound",
    sessionDirectionalRead: "neutral",
    modelDetected: true,
    modelName: "accumulation_manipulation_expansion",
    modelState: "confirmed",
    modelDirection: "bullish",
    modelReasons: ["Structured opportunity exists."],
    modelMissingEvidence: ["safe target missing"],
    opportunityDetected: true,
    opportunityType: "session_continuation",
    opportunityStage: "confirmed",
    opportunityQuality: "high",
    opportunityDirection: "bullish",
    opportunityLaneRecommendation: "queue_research_hypothesis",
    opportunityNextAction: "Replay-test the hypothesis before changing model lanes.",
    opportunityMissingEvidence: ["external liquidity target missing"],
    opportunityBlockers: ["approved setup profile rejected current read"],
    selfImprovementHypothesisQueued: true,
    selfImprovementHypothesisStatus: "queued_for_replay",
    selfImprovementHypothesisReason: "Research hypothesis queued - needs replay validation.",
    selfImprovementNextValidation: "Run replay validation before paper testing.",
    fvgTargetDetected: false,
    fvgTargetReason: "session draw context missing",
    targetConstructionStatus: "missing",
    targetConstructionReason: "No safe external liquidity target found.",
    invalidationConstructionStatus: "missing",
    invalidationConstructionReason: "No safe invalidation level found.",
    rrConstructionStatus: "missing",
    rrConstructionReason: "Target/invalidation required before RR.",
    topReasons: ["Approved-profile layer rejected the current read."],
    nextAction: "Wait for cleaner target, invalidation, and RR profile.",
    debug: {
      candleCount: 1000,
      primaryTimeframeAvailable: true,
      htfTimeframesAvailable: ["15m", "1h"],
      phase1SignalCount: 4,
      phase2SignalCount: 4,
      approvedStatus: "rejected_candidate",
      rejectionReasonsCount: 1,
      noTradeReasonsCount: 0,
      lastEvaluationAt: "2026-06-07T12:00:00.000Z",
      packetSource: "live_mt5",
      sourceFingerprint: "mt5:USTECH:5m:1000:test",
      hydrationSource: "mt5_read_only_explicit_activation",
      analysisTimeframesUsed: ["W1", "D1", "H4", "H1", "M15", "M5"],
      analysisDepthStatus: "sufficient",
      weeklyBiasStatus: "loaded",
      weeklyBiasDirection: "bullish"
    },
    authority,
    safety,
    ...overrides
  };
}

function baseResearchSignal(currentRead, overrides = {}) {
  return {
    signalId: "signal_test",
    generatedAt: "2026-06-07T12:00:00.000Z",
    researchOnly: true,
    status: "rejected_signal",
    executionReadiness: "research_only",
    executionAllowed: false,
    requestedSymbol: currentRead.requestedSymbol,
    brokerSymbol: currentRead.brokerSymbol,
    primaryTimeframe: currentRead.primaryTimeframe,
    htfTimeframes: currentRead.htfTimeframes,
    side: currentRead.side,
    approvedProfileStatus: currentRead.approvedStatus,
    modelQualityLane: currentRead.modelQualityLane,
    paperWatchlistEligible: currentRead.paperWatchlistEligible,
    paperWatchlistReason: currentRead.paperWatchlistReason,
    paperSimEligibilityStatus: currentRead.paperSimEligibilityStatus,
    paperSimEligibilityReason: currentRead.paperSimEligibilityReason,
    paperSimAllowed: currentRead.paperSimAllowed,
    paperOnly: currentRead.paperOnly,
    readinessSummary: currentRead.readinessSummary,
    modelDetected: currentRead.modelDetected,
    modelName: currentRead.modelName,
    modelState: currentRead.modelState,
    modelDirection: currentRead.modelDirection,
    opportunityDetected: currentRead.opportunityDetected,
    opportunityType: currentRead.opportunityType,
    opportunityStage: currentRead.opportunityStage,
    opportunityQuality: currentRead.opportunityQuality,
    opportunityDirection: currentRead.opportunityDirection,
    opportunityNextAction: currentRead.opportunityNextAction,
    opportunityMissingEvidence: currentRead.opportunityMissingEvidence,
    opportunityBlockers: currentRead.opportunityBlockers,
    dataDepthStatus: currentRead.dataDepthStatus,
    reasons: currentRead.topReasons,
    rejectionReasons: ["missing target", "missing invalidation", "missing RR"],
    warnings: [],
    nextAction: currentRead.nextAction,
    authority,
    safety,
    provenance: {
      source: "ict_current_read",
      methodology: "ICT",
      researchOnly: true,
      generatedAt: "2026-06-07T12:00:00.000Z"
    },
    ...overrides
  };
}

function getSection(explanation, id) {
  const section = explanation.sections.find((candidate) => candidate.id === id);
  assert.ok(section, `section ${id} must exist`);
  assert.ok(section.status, `${id} must include status`);
  assert.ok(section.reason, `${id} must include reason`);
  assert.ok(section.nextAction, `${id} must include next safe action`);
  return section;
}

compileForNode();
const {
  assertResearchAdvisorDecisionExplanationIsCompact,
  buildResearchAdvisorDecisionExplanation
} = await import(pathToFileURL(path.join(outRoot, "ictResearchAdvisorDecisionExplanation.mjs")).href);

const currentRead = baseCurrentRead();
const researchSignal = baseResearchSignal(currentRead);
const explanation = buildResearchAdvisorDecisionExplanation({ currentRead, researchSignal });

assert.match(getSection(explanation, "source_context").reason, /live mt5|live_mt5/i);
assert.match(getSection(explanation, "lane_decision").reason, /Lane rejected because/i);
assert.match(getSection(explanation, "paper_sim").reason, /Paper Sim not eligible because/i);
assert.match(getSection(explanation, "cmd_paper").reason, /CMD Paper not eligible - current model is accumulation manipulation expansion/i);
assert.match(getSection(explanation, "monte_carlo").reason, /Monte Carlo not saved - no replay\/paper outcome sample yet/i);
assert.match(getSection(explanation, "readiness_split").reason, /Paper readiness not eligible because/i);
assert.match(getSection(explanation, "walk_forward").reason, /Walk-forward insufficient because/i);
assert.match(getSection(explanation, "evidence_quality").reason, /Evidence quality weak because/i);
assert.match(getSection(explanation, "next_safe_action").reason, /execution remains disabled/i);

assert.equal(explanation.authority.executionAuthority, "none");
assert.equal(explanation.authority.brokerAuthority, "none");
assert.equal(explanation.authority.readinessOverrideAuthority, "none");
assert.equal(explanation.safety.rawCandlesExcluded, true);
assert.equal(assertResearchAdvisorDecisionExplanationIsCompact(explanation).ok, true);

const serialized = JSON.stringify(explanation);
assert.doesNotMatch(serialized, /"rawCandles"\s*:|"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"secret"\s*:|"password"\s*:|"api[_-]?key"\s*:|"accountData"\s*:|"orderData"\s*:|"positionData"\s*:/i);

const cmdRead = baseCurrentRead({
  modelName: "consolidation_manipulation_distribution",
  modelQualityLane: "paper_watchlist",
  approvedStatus: "paper_watchlist_candidate",
  paperWatchlistEligible: true,
  paperWatchlistReason: "CMD strict paper-watchlist gates passed.",
  paperSimEligibilityStatus: "eligible",
  paperSimEligibilityReason: "Explicit paper-watchlist candidate.",
  paperSimAllowed: true,
  paperOnly: true,
  target: 30100,
  invalidation: 30400,
  rrEstimate: 1.8,
  side: "short"
});
const cmdExplanation = buildResearchAdvisorDecisionExplanation({
  currentRead: cmdRead,
  researchSignal: baseResearchSignal(cmdRead, {
    status: "watchlist_signal",
    modelName: "consolidation_manipulation_distribution",
    modelQualityLane: "paper_watchlist",
    approvedProfileStatus: "paper_watchlist_candidate",
    paperWatchlistEligible: true,
    paperSimAllowed: true,
    paperOnly: true,
    target: 30100,
    invalidation: 30400,
    rrEstimate: 1.8,
    side: "short"
  })
});
assert.match(getSection(cmdExplanation, "cmd_paper").reason, /CMD Paper eligible/i);
assert.equal(assertResearchAdvisorDecisionExplanationIsCompact(cmdExplanation).ok, true);

const uiSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "IctAdvisorSummaryPanel.tsx"), "utf8");
assert.match(uiSource, /research-advisor-decision-explanation/);
assert.match(uiSource, /Decision Explanation/);

process.stdout.write(JSON.stringify({
  status: "passed",
  sections: explanation.sections.map(({ id, status }) => ({ id, status })),
  authority,
  compactBytes: assertResearchAdvisorDecisionExplanationIsCompact(explanation).serializedBytes
}, null, 2));
process.stdout.write("\n");
