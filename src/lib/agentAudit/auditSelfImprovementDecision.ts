import { createAgentDecisionTrace } from "@/lib/agentAudit/createAgentDecisionTrace";
import type { AgentDecisionTrace } from "@/lib/agentAudit/agentAuditTypes";
import type { CalibrationProposal } from "@/lib/selfImprovement";
import { safeArray } from "@/lib/utils";

const changedVariablesFor = (proposal: CalibrationProposal) =>
  [
    proposal.proposedChanges.confluenceThreshold !== undefined ? "confluence threshold" : undefined,
    proposal.proposedChanges.confidenceThreshold !== undefined ? "confidence threshold" : undefined,
    proposal.proposedChanges.sessionFilter !== undefined ? "session filter" : undefined,
    proposal.proposedChanges.stopModel !== undefined ? "stop model" : undefined,
    proposal.proposedChanges.targetRMultiple !== undefined ? "target R multiple" : undefined,
    proposal.proposedChanges.agentWeights ? "agent weights" : undefined,
    proposal.proposedChanges.ictScoringWeights ? "ICT scoring weights" : undefined
  ].filter((item): item is string => Boolean(item));

export function auditSelfImprovementDecision(proposal?: CalibrationProposal): AgentDecisionTrace[] {
  if (!proposal) {
    return [];
  }
  const changedVariables = changedVariablesFor(proposal);
  return [
    createAgentDecisionTrace({
      agentId: "self-improvement-supervisor",
      agentName: "Self-Improvement Proposal Creator",
      decisionType: "self_improvement_proposal",
      inputFacts: [
        `proposal ${proposal.proposalId}`,
        `status ${proposal.status}`,
        `target ${proposal.targetProblem}`,
        `intent ${proposal.proposalIntent ?? "manual"}`
      ],
      evidenceUsed: [
        proposal.reason,
        proposal.comparisonResult?.summary,
        ...safeArray(proposal.improvementSummary),
        ...safeArray(proposal.qualityGatesPassed).map((gate) => `Gate passed: ${gate}`)
      ].filter((item): item is string => Boolean(item)),
      evidenceMissing: [
        !proposal.afterMetrics ? "Proposal has no afterMetrics simulation evidence." : undefined,
        !proposal.comparisonResult ? "Proposal has no before/after comparison." : undefined,
        changedVariables.length > 2 ? "Proposal changes more than a small grouped set." : undefined
      ].filter((item): item is string => Boolean(item)),
      evidenceIgnored: safeArray(proposal.notReadyReasons),
      assumptions: [
        "Proposal is a research calibration candidate until approved.",
        "Baseline must be retested after approval."
      ],
      thresholdsUsed: [
        proposal.activeConfluenceThreshold !== undefined ? `active confluence ${(proposal.activeConfluenceThreshold * 100).toFixed(0)}%` : undefined,
        proposal.proposedConfluenceThreshold !== undefined ? `proposed confluence ${(proposal.proposedConfluenceThreshold * 100).toFixed(0)}%` : undefined,
        proposal.recoveryConfluenceThreshold !== undefined ? `recovery confluence ${(proposal.recoveryConfluenceThreshold * 100).toFixed(0)}%` : undefined
      ].filter((item): item is string => Boolean(item)),
      confidenceBefore: Math.min(0.95, proposal.beforeMetrics.stabilityScore / 100),
      confidenceAfter: proposal.afterMetrics ? Math.min(0.95, proposal.afterMetrics.stabilityScore / 100) : undefined,
      finalBias: "no_opinion",
      finalRecommendation:
        proposal.status === "proposed"
          ? "Review approval-required research calibration proposal."
          : `Proposal status is ${proposal.status}.`,
      riskWarnings: [
        ...safeArray(proposal.safetyNotes),
        ...safeArray(proposal.notReadyReasons)
      ],
      decisionRulesApplied: [
        "Only allowed simulation settings can change.",
        "User approval remains required.",
        "Do not enable demo/live trading.",
        "Do not override readiness gate."
      ],
      safetyConstraintsChecked: [
        `mode ${proposal.mode}`,
        `executionAuthority ${proposal.executionAuthority}`,
        `brokerAuthority ${proposal.brokerAuthority}`,
        `readinessOverrideAuthority ${proposal.readinessOverrideAuthority}`,
        `approvalRequired ${proposal.approvalRequired ? "true" : "false"}`
      ],
      possibleFailureModes: [
        "Proposal may improve trade count but not quality.",
        "Before/after comparison may be under-sampled.",
        "A grouped change may hide which variable helped."
      ],
      relatedEntityId: proposal.proposalId,
      relatedPage: "/self-improvement"
    })
  ];
}
