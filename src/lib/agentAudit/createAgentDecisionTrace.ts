import type {
  AgentAuditVerdict,
  AgentDecisionTrace,
  AgentDecisionType
} from "@/lib/agentAudit/agentAuditTypes";
import type { MarketBias } from "@/lib/types";
import { clamp, safeArray, safeTopN, uid } from "@/lib/utils";

const unsafePhrases = [
  "execute trade",
  "place trade",
  "send order",
  "open position",
  "close position",
  "override readiness",
  "broker control",
  "live trading"
];

const compact = (items: string[] | undefined, limit = 6) =>
  safeTopN(safeArray(items).filter(Boolean), limit);

const scoreVerdict = (score: number, unsafe: boolean, inconsistent: boolean): AgentAuditVerdict => {
  if (unsafe) {
    return "unsafe_rejected";
  }
  if (inconsistent) {
    return "inconsistent";
  }
  if (score >= 82) {
    return "reliable";
  }
  if (score >= 65) {
    return "needs_review";
  }
  return "weak_evidence";
};

export function createAgentDecisionTrace({
  agentId,
  agentName,
  decisionType,
  inputFacts,
  evidenceUsed,
  evidenceMissing,
  evidenceIgnored,
  assumptions,
  thresholdsUsed,
  confidenceBefore,
  confidenceAfter,
  finalBias,
  finalRecommendation,
  riskWarnings,
  decisionRulesApplied,
  safetyConstraintsChecked,
  possibleFailureModes,
  relatedEntityId,
  relatedPage
}: {
  agentId: string;
  agentName: string;
  decisionType: AgentDecisionType;
  inputFacts?: string[];
  evidenceUsed?: string[];
  evidenceMissing?: string[];
  evidenceIgnored?: string[];
  assumptions?: string[];
  thresholdsUsed?: string[];
  confidenceBefore?: number;
  confidenceAfter?: number;
  finalBias?: MarketBias | "no_opinion";
  finalRecommendation: string;
  riskWarnings?: string[];
  decisionRulesApplied?: string[];
  safetyConstraintsChecked?: string[];
  possibleFailureModes?: string[];
  relatedEntityId?: string;
  relatedPage?: string;
}): AgentDecisionTrace {
  const missing = compact(evidenceMissing, 8);
  const ignored = compact(evidenceIgnored, 6);
  const risks = compact(riskWarnings, 8);
  const rules = compact(decisionRulesApplied, 8);
  const safety = compact(safetyConstraintsChecked, 8);
  const recommendationText = finalRecommendation.toLowerCase();
  const unsafeText = unsafePhrases.find((phrase) => recommendationText.includes(phrase));
  const unsafe = Boolean(
    unsafeText ||
      safety.some((item) => item.toLowerCase().includes("failed")) ||
      safety.some((item) => item.toLowerCase().includes("authority") && !item.toLowerCase().includes("none"))
  );
  const confidenceTooHighForEvidence =
    typeof confidenceAfter === "number" &&
    confidenceAfter > 0.72 &&
    (missing.length > 1 || compact(evidenceUsed).length < 2);
  const inconsistent = Boolean(confidenceTooHighForEvidence || ignored.length > 2);
  const score = clamp(
    100 -
      missing.length * 9 -
      ignored.length * 7 -
      risks.length * 4 -
      (rules.length ? 0 : 10) -
      (safety.length ? 0 : 18) -
      (confidenceTooHighForEvidence ? 14 : 0) -
      (unsafe ? 100 : 0),
    0,
    100
  );

  return {
    traceId: uid("agent_trace"),
    timestamp: new Date().toISOString(),
    agentId,
    agentName,
    decisionType,
    inputFacts: compact(inputFacts, 8),
    evidenceUsed: compact(evidenceUsed, 8),
    evidenceMissing: missing,
    evidenceIgnored: ignored,
    assumptions: compact(assumptions, 6),
    thresholdsUsed: compact(thresholdsUsed, 8),
    confidenceBefore,
    confidenceAfter,
    finalBias,
    finalRecommendation,
    riskWarnings: risks,
    decisionRulesApplied: rules,
    safetyConstraintsChecked: safety.length
      ? safety
      : ["Execution authority none", "Broker authority none", "Readiness override authority none"],
    possibleFailureModes: compact(possibleFailureModes, 8),
    auditScore: Number(score.toFixed(1)),
    auditVerdict: scoreVerdict(score, unsafe, inconsistent),
    relatedEntityId,
    relatedPage
  };
}
