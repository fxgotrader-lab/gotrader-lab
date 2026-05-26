import { createAgentDecisionTrace } from "@/lib/agentAudit/createAgentDecisionTrace";
import type { AgentDecisionTrace } from "@/lib/agentAudit/agentAuditTypes";
import type { AutoResearchCycle } from "@/lib/autoResearch";
import { safeArray, safeTopN } from "@/lib/utils";

export function auditAutoResearchDecision(cycle?: AutoResearchCycle): AgentDecisionTrace[] {
  if (!cycle) {
    return [];
  }
  const best = cycle.bestCandidate ?? cycle.closestCandidates?.[0];
  const failedGates = safeArray(cycle.failedGates).map((gate) => gate.replace(/_/g, " "));
  const rejectedReasons = safeTopN(safeArray(cycle.rejectedCandidates).flatMap((candidate) => candidate.rejectionReasons), 5);

  return [
    createAgentDecisionTrace({
      agentId: "auto-research-supervisor",
      agentName: "Auto Research Candidate Selector",
      decisionType: "auto_research_selector",
      inputFacts: [
        `search mode ${cycle.searchMode}`,
        `candidates tested ${cycle.candidatesTested}`,
        `final category ${cycle.finalResultCategory}`,
        `proposal ${cycle.createdProposalId ?? "none"}`
      ],
      evidenceUsed: [
        best ? `Best candidate ${best.label} scored ${best.scoreBreakdown.totalScore}.` : "No best candidate selected.",
        best ? `Readiness estimate ${best.readinessEstimate.state}.` : undefined,
        cycle.recoveryAttempted ? `Recovery trades ${cycle.tradesAfterRecovery ?? 0}.` : undefined,
        ...safeArray(cycle.adaptivePasses).map((pass) => `Pass ${pass.passNumber}: ${pass.finalOutcome}.`)
      ].filter((item): item is string => Boolean(item)),
      evidenceMissing: [
        !best ? "No candidate survived selection." : undefined,
        cycle.tradesBeforeRecovery === 0 && !cycle.recoveryAttempted ? "Zero-trade run had no recovery attempt." : undefined,
        ...failedGates
      ].filter((item): item is string => Boolean(item)),
      evidenceIgnored: best?.scoreBreakdown.profitFactorScore && best.scoreBreakdown.profitFactorScore > best.scoreBreakdown.robustnessScore + 25
        ? ["Profit factor dominated robustness score; verify stability-first selection."]
        : [],
      assumptions: [
        "Candidate search is bounded.",
        "Selection prioritizes stability before profit.",
        "No broker or execution settings are searchable."
      ],
      thresholdsUsed: [
        best ? `candidate confluence ${(best.config.minimumConfluenceThreshold * 100).toFixed(0)}%` : undefined,
        best ? `candidate confidence ${(best.config.minimumConfidenceThreshold * 100).toFixed(0)}%` : undefined,
        cycle.recoveryMetadata ? `recovery threshold ${(cycle.recoveryMetadata.recoveryConfluenceThreshold ?? cycle.recoveryMetadata.proposedConfluenceThreshold) * 100}%` : undefined
      ].filter((item): item is string => Boolean(item)),
      confidenceAfter: best ? Math.min(0.95, best.scoreBreakdown.totalScore / 100) : 0,
      finalBias: "no_opinion",
      finalRecommendation: cycle.createdProposalId
        ? `Created approval-required proposal ${cycle.createdProposalId}.`
        : cycle.noSafePaperDemoCandidateFound
          ? "No safe Paper-Demo Candidate found. Continue research."
          : `Selected ${best?.label ?? "no candidate"}.`,
      riskWarnings: [
        ...rejectedReasons,
        ...safeArray(cycle.recoveryFailureReasons)
      ],
      decisionRulesApplied: [
        "Run bounded candidate configs.",
        "Rank by stability-first score.",
        "Reject overfit or unsafe candidates.",
        "Create proposals only when approval remains required."
      ],
      safetyConstraintsChecked: [
        "Execution authority none",
        "Broker authority none",
        "Readiness override authority none",
        "Auto Research cannot approve its own proposal"
      ],
      possibleFailureModes: [
        "Candidate sample size may be too small.",
        "Recovery may produce trades without stable quality.",
        "Validation evidence may be compacted for storage."
      ],
      relatedEntityId: cycle.cycleId,
      relatedPage: "/auto-research"
    })
  ];
}
