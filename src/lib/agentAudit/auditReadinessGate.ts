import { createAgentDecisionTrace } from "@/lib/agentAudit/createAgentDecisionTrace";
import type { AgentDecisionTrace } from "@/lib/agentAudit/agentAuditTypes";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import { safeArray, safeTopN } from "@/lib/utils";

export function auditReadinessGate(readiness?: ReadinessGateSnapshot): AgentDecisionTrace[] {
  if (!readiness) {
    return [];
  }
  return [
    createAgentDecisionTrace({
      agentId: "readiness-gate",
      agentName: "Readiness Gate Decision",
      decisionType: "readiness_gate",
      inputFacts: [
        `state ${readiness.state}`,
        `passed ${safeArray(readiness.passedRequirements).length}`,
        `failed ${safeArray(readiness.failedRequirements).length}`,
        `broker execution disabled ${readiness.brokerExecutionDisabled ? "yes" : "no"}`
      ],
      evidenceUsed: safeTopN(safeArray(readiness.passedRequirements).map((requirement) => `${requirement.label}: ${requirement.currentValue}`), 6),
      evidenceMissing: safeTopN(safeArray(readiness.failedRequirements).map((requirement) => `${requirement.label}: ${requirement.currentValue}; requires ${requirement.requiredValue}`), 8),
      evidenceIgnored: [],
      assumptions: [
        "Paper-Demo Candidate requires every blocker to pass.",
        "Manual approval cannot override failed requirements."
      ],
      thresholdsUsed: safeArray(readiness.failedRequirements).map((requirement) => `${requirement.label}: ${requirement.requiredValue}`),
      confidenceAfter: readiness.state === "Paper-Demo Candidate" ? 0.9 : readiness.state === "Research Ready" ? 0.68 : 0.35,
      finalBias: "no_opinion",
      finalRecommendation: readiness.recommendedNextStep,
      riskWarnings: [
        ...safeArray(readiness.warnings),
        ...safeArray(readiness.failedRequirements).map((requirement) => requirement.suggestedFix)
      ],
      decisionRulesApplied: [
        "Block Paper-Demo Candidate unless all required checks pass.",
        "Require LLM advisory review for real research mode.",
        "Keep broker execution disabled."
      ],
      safetyConstraintsChecked: [
        "Execution authority none",
        "Broker authority none",
        "Readiness override authority none",
        `brokerExecutionDisabled ${readiness.brokerExecutionDisabled ? "true" : "false"}`
      ],
      possibleFailureModes: [
        "Missing validation can look like strategy failure.",
        "Zero-trade runs cannot prove readiness.",
        "Manual approval may be stale if validation changes."
      ],
      relatedEntityId: readiness.id,
      relatedPage: "/readiness-gate"
    })
  ];
}
