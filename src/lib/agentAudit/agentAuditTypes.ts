import type { AutoResearchCycle } from "@/lib/autoResearch";
import type { AgentDebateSession } from "@/lib/agentDebate";
import type { LLMAdvisoryRun } from "@/lib/llm";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { CalibrationProposal } from "@/lib/selfImprovement";
import type { AgentDebateMessage, MarketBias, TradeThesis } from "@/lib/types";

export type AgentDecisionType =
  | "deterministic_agent"
  | "cio_synthesis"
  | "agent_debate"
  | "llm_advisory"
  | "auto_research_selector"
  | "self_improvement_proposal"
  | "readiness_gate";

export type AgentAuditVerdict =
  | "reliable"
  | "needs_review"
  | "weak_evidence"
  | "inconsistent"
  | "unsafe_rejected";

export interface AgentDecisionTrace {
  traceId: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  decisionType: AgentDecisionType;
  inputFacts: string[];
  evidenceUsed: string[];
  evidenceMissing: string[];
  evidenceIgnored: string[];
  assumptions: string[];
  thresholdsUsed: string[];
  confidenceBefore?: number;
  confidenceAfter?: number;
  finalBias?: MarketBias | "no_opinion";
  finalRecommendation: string;
  riskWarnings: string[];
  decisionRulesApplied: string[];
  safetyConstraintsChecked: string[];
  possibleFailureModes: string[];
  auditScore: number;
  auditVerdict: AgentAuditVerdict;
  relatedEntityId?: string;
  relatedPage?: string;
}

export interface AgentAuditState {
  traces: AgentDecisionTrace[];
  latestAuditAt?: string;
  safetyNotice: "Agent audit is research/explainability only. It cannot execute trades, approve trades, or override readiness gates.";
}

export interface AgentAuditSourceContext {
  thesis?: TradeThesis;
  debateMessages?: AgentDebateMessage[];
  llmRun?: LLMAdvisoryRun;
  agentDebateSession?: AgentDebateSession;
  autoResearchCycle?: AutoResearchCycle;
  proposal?: CalibrationProposal;
  readiness?: ReadinessGateSnapshot;
}

export interface AgentAuditSummary {
  latestAuditAt?: string;
  weakestAgent?: AgentDecisionTrace;
  strongestAgent?: AgentDecisionTrace;
  needsReviewCount: number;
  unsafeRejectedCount: number;
  traceCount: number;
}
