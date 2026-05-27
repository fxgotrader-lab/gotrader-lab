import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { uid } from "@/lib/utils";

import type {
  AdvisoryCandidateSummary,
  AdvisoryHookSafetyLocks,
  AdvisoryProposalSummary,
  AdvisoryWalkForwardSummary,
  OpenClawMemoryHookPacket,
  OpenClawMemoryHookResponse,
  OpenClawMemoryHookState,
  OpenClawMemoryHookType
} from "@/lib/integrations/advisoryMemoryTypes";

export const advisoryHookSafetyLocks: AdvisoryHookSafetyLocks = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none",
  brokerExecutionDisabled: true,
  liveTradingDisabled: true,
  goTraderHandoffAuthority: "none",
  paperDemoApprovalAuthority: "none"
};

export const openClawMemoryHookTypes: OpenClawMemoryHookType[] = [
  "failure_analysis_memory",
  "scenario_recommendation",
  "proposal_review",
  "calibration_drift_note",
  "post_cycle_summary"
];

export const openClawMemoryHookSpec = {
  status: "planned" as const,
  openClawMemory: "not_connected" as const,
  mode: "advisory_memory_only" as const,
  events: openClawMemoryHookTypes,
  authority: {
    executionAuthority: "none" as const,
    brokerAuthority: "none" as const,
    readinessOverrideAuthority: "none" as const
  },
  safetyLocks: advisoryHookSafetyLocks,
  futureBridge: "local_or_vps_bridge_optional",
  sourceOfTruth: "gotrader_ai_lab"
};

const defaultFingerprint = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.fingerprints.latestCycle ?? snapshot?.fingerprints.activeBaseline;

const candidateSummaryFor = (snapshot?: ResearchRuntimeSnapshot): AdvisoryCandidateSummary | undefined => {
  const candidate = snapshot?.latestResearchCycle.latestRun?.bestCandidateSummary;
  return candidate
    ? {
        candidateId: candidate.candidateId,
        label: candidate.label,
        score: candidate.score,
        resultCategory: candidate.resultCategory,
        readinessEstimate: candidate.readinessEstimate
      }
    : undefined;
};

const walkForwardSummaryFor = (snapshot?: ResearchRuntimeSnapshot): AdvisoryWalkForwardSummary | undefined =>
  snapshot?.walkForward.latestRun
    ? {
        runId: snapshot.walkForward.latestRunId,
        verdict: snapshot.walkForward.verdict,
        overfitRisk: snapshot.walkForward.overfitRisk,
        windowsTested: snapshot.walkForward.windowsTested,
        outOfSampleWindowsPassed: snapshot.walkForward.outOfSampleWindowsPassed,
        stabilityScore: snapshot.walkForward.stabilityScore
      }
    : undefined;

const proposalSummaryFor = (snapshot?: ResearchRuntimeSnapshot): AdvisoryProposalSummary | undefined =>
  snapshot?.proposal.latestProposal
    ? {
        proposalId: snapshot.proposal.latestProposal.proposalId,
        status: snapshot.proposal.latestProposal.status,
        category: snapshot.proposal.latestProposal.proposalIntent,
        sourceCycleId: snapshot.proposal.proposalSourceCycleId,
        approvalRequired: snapshot.proposal.latestProposal.approvalRequired
      }
    : undefined;

export function createOpenClawMemoryHookPacket({
  blockers,
  candidateSummary,
  eventType,
  scenarioFamily,
  snapshot,
  walkForwardSummary,
  proposalSummary
}: {
  blockers?: string[];
  candidateSummary?: AdvisoryCandidateSummary;
  eventType: OpenClawMemoryHookType;
  scenarioFamily?: string;
  snapshot?: ResearchRuntimeSnapshot;
  walkForwardSummary?: AdvisoryWalkForwardSummary;
  proposalSummary?: AdvisoryProposalSummary;
}): OpenClawMemoryHookPacket {
  const cycleId = snapshot?.latestResearchCycle.latestCycleId;
  return {
    eventId: uid("openclaw_memory_event"),
    eventType,
    timestamp: new Date().toISOString(),
    cycleId,
    runtimeFingerprint: defaultFingerprint(snapshot),
    dataSource: snapshot?.marketData.sourceLabel ?? "runtime snapshot unavailable",
    evidenceQuality: snapshot?.evidence.evidenceQualityScore ?? 0,
    maturityScore: snapshot?.maturity.maturityScore ?? 0,
    readinessState: snapshot?.readiness.readinessState ?? "unknown",
    blockers: blockers ?? snapshot?.readiness.actualBlockers ?? [],
    scenarioFamily,
    candidateSummary: candidateSummary ?? candidateSummaryFor(snapshot),
    walkForwardSummary: walkForwardSummary ?? walkForwardSummaryFor(snapshot),
    proposalSummary: proposalSummary ?? proposalSummaryFor(snapshot),
    safetyLocks: advisoryHookSafetyLocks,
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
}

export function createPlannedOpenClawMemoryHookState(snapshot?: ResearchRuntimeSnapshot): OpenClawMemoryHookState {
  return {
    status: "planned",
    openClawMemory: "not_connected",
    packets: {
      post_cycle_summary: createOpenClawMemoryHookPacket({
        eventType: "post_cycle_summary",
        snapshot
      })
    },
    safetyLocks: advisoryHookSafetyLocks
  };
}

export const sampleOpenClawMemoryResponse: OpenClawMemoryHookResponse = {
  mode: "advisory_memory_only",
  recommendationType: "recommend_scenario_family",
  memoryNote:
    "Remember that repeated low average R with weak OOS consistency should trigger target_model_focus before broad random search.",
  suggestedNextScenario: "target_model_focus",
  riskWarnings: ["Do not treat advisory memory as approval."],
  missingEvidence: ["Walk-forward evidence with enough OOS trades."],
  confidence: 0.62,
  authority: {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  }
};
