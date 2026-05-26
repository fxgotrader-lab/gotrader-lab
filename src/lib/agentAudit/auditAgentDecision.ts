import { createAgentDecisionTrace } from "@/lib/agentAudit/createAgentDecisionTrace";
import type {
  AgentAuditSourceContext,
  AgentAuditState,
  AgentAuditSummary,
  AgentDecisionTrace
} from "@/lib/agentAudit/agentAuditTypes";
import type { LLMAdvisoryRun } from "@/lib/llm";
import { safeArray, safeTopN } from "@/lib/utils";
import type { AgentDebateMessage, TradeThesis } from "@/lib/types";

export const AGENT_AUDIT_STORAGE_KEY = "gotrader_ai_lab_agent_audit_state";
export const AGENT_AUDIT_UPDATED_EVENT = "gotrader-ai-lab-agent-audit-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const safetyNotice: AgentAuditState["safetyNotice"] =
  "Agent audit is research/explainability only. It cannot execute trades, approve trades, or override readiness gates.";

const initialState = (): AgentAuditState => ({
  traces: [],
  safetyNotice
});

const compactTrace = (trace: AgentDecisionTrace): AgentDecisionTrace => ({
  ...trace,
  inputFacts: safeTopN(trace.inputFacts, 8),
  evidenceUsed: safeTopN(trace.evidenceUsed, 8),
  evidenceMissing: safeTopN(trace.evidenceMissing, 8),
  evidenceIgnored: safeTopN(trace.evidenceIgnored, 6),
  assumptions: safeTopN(trace.assumptions, 6),
  thresholdsUsed: safeTopN(trace.thresholdsUsed, 8),
  riskWarnings: safeTopN(trace.riskWarnings, 8),
  decisionRulesApplied: safeTopN(trace.decisionRulesApplied, 8),
  safetyConstraintsChecked: safeTopN(trace.safetyConstraintsChecked, 8),
  possibleFailureModes: safeTopN(trace.possibleFailureModes, 8)
});

const publish = (state: AgentAuditState) => {
  const nextState: AgentAuditState = {
    ...state,
    traces: safeTopN(state.traces, 20).map(compactTrace),
    latestAuditAt: state.latestAuditAt ?? state.traces[0]?.timestamp,
    safetyNotice
  };
  if (isBrowser()) {
    window.localStorage.setItem(AGENT_AUDIT_STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent(AGENT_AUDIT_UPDATED_EVENT, { detail: nextState }));
  }
  return nextState;
};

export function loadAgentAuditState(): AgentAuditState {
  if (!isBrowser()) {
    return initialState();
  }
  const raw = window.localStorage.getItem(AGENT_AUDIT_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AgentAuditState>;
    return {
      ...initialState(),
      ...parsed,
      traces: safeArray(parsed.traces),
      safetyNotice
    };
  } catch {
    return publish(initialState());
  }
}

export function saveAgentAuditTraces(traces: AgentDecisionTrace[], existing = loadAgentAuditState()) {
  const combined = [
    ...safeArray(traces),
    ...safeArray(existing.traces).filter((trace) => !safeArray(traces).some((item) => item.traceId === trace.traceId))
  ];
  return publish({
    ...existing,
    traces: combined,
    latestAuditAt: safeArray(traces)[0]?.timestamp ?? existing.latestAuditAt
  });
}

export function clearAgentAuditHistory() {
  return publish(initialState());
}

export function summarizeAgentAudit(state = loadAgentAuditState()): AgentAuditSummary {
  const traces = safeArray(state.traces);
  const sorted = [...traces].sort((a, b) => b.auditScore - a.auditScore);
  return {
    latestAuditAt: state.latestAuditAt,
    strongestAgent: sorted[0],
    weakestAgent: [...traces].sort((a, b) => a.auditScore - b.auditScore)[0],
    needsReviewCount: traces.filter((trace) => trace.auditVerdict !== "reliable").length,
    unsafeRejectedCount: traces.filter((trace) => trace.auditVerdict === "unsafe_rejected").length,
    traceCount: traces.length
  };
}

export function auditDeterministicAgentDecision(message: AgentDebateMessage, thesis?: TradeThesis): AgentDecisionTrace {
  const supportingFactors = safeArray(message.supportingFactors);
  const warningFactors = safeArray(message.warningFactors);
  const recommendation = message.recommendation ?? message.message;
  const weight = message.weight ?? 1;
  return createAgentDecisionTrace({
    agentId: message.agentId,
    agentName: message.agentName,
    decisionType: "deterministic_agent",
    inputFacts: [
      thesis ? `${thesis.symbol} ${thesis.timeframe}` : undefined,
      thesis ? `ICT bias ${thesis.ictContext.bias}` : undefined,
      thesis ? `Confluence ${(thesis.ictContext.confluenceScore * 100).toFixed(0)}%` : undefined,
      `Message stance ${message.stance}`
    ].filter((item): item is string => Boolean(item)),
    evidenceUsed: supportingFactors,
    evidenceMissing: supportingFactors.length ? warningFactors : ["No supporting factors were attached to this decision."],
    evidenceIgnored: thesis?.ictContext.bias !== message.stance && message.stance !== "neutral"
      ? [`Agent stance ${message.stance} differs from ICT bias ${thesis?.ictContext.bias}.`]
      : [],
    assumptions: ["Deterministic agent uses mock ICT facts only.", "Research signal remains simulation-only."],
    thresholdsUsed: [
      `confidence ${(message.confidence * 100).toFixed(0)}%`,
      `weight ${weight.toFixed(2)}`
    ],
    confidenceAfter: message.confidence,
    finalBias: message.stance,
    finalRecommendation: recommendation,
    riskWarnings: warningFactors,
    decisionRulesApplied: [
      "Use structured ICT context facts.",
      "Attach supporting and warning factors.",
      "Do not exceed advisory research authority."
    ],
    safetyConstraintsChecked: [
      "Execution authority none",
      "Broker authority none",
      "Readiness override authority none"
    ],
    possibleFailureModes: [
      "Mock data may not represent live market regimes.",
      "Agent may overweight one ICT concept.",
      "Confidence may be high despite missing external validation."
    ],
    relatedEntityId: thesis?.id,
    relatedPage: "/research"
  });
}

export function auditLLMAdvisoryRun(run?: LLMAdvisoryRun): AgentDecisionTrace[] {
  if (!run) {
    return [];
  }
  return safeArray(run.responses).map((response) =>
    createAgentDecisionTrace({
      agentId: response.agentId,
      agentName: response.agentName,
      decisionType: "llm_advisory",
      inputFacts: [
        `provider ${run.providerMode}`,
        `advisory passed ${run.advisoryPassed ? "yes" : "no"}`,
        `run status ${run.status}`
      ],
      evidenceUsed: [response.reasoningSummary, ...safeArray(response.suggestedCalibration)],
      evidenceMissing: response.missingEvidence,
      evidenceIgnored: [],
      assumptions: ["LLM response is advisory-only and must be validated before display."],
      thresholdsUsed: [`advisory confidence ${(response.confidence * 100).toFixed(0)}%`],
      confidenceAfter: response.confidence,
      finalBias: response.bias,
      finalRecommendation: response.proceedRecommendation,
      riskWarnings: response.riskWarnings,
      decisionRulesApplied: [
        "Validate JSON schema.",
        "Reject execution, broker, key, or readiness override authority.",
        "Use advisory recommendation only."
      ],
      safetyConstraintsChecked: [
        `mode ${response.mode}`,
        `executionAuthority ${response.executionAuthority}`,
        `brokerAuthority ${response.brokerAuthority}`,
        `readinessOverrideAuthority ${response.readinessOverrideAuthority}`
      ],
      possibleFailureModes: [
        "LLM may miss weak evidence.",
        "LLM may overstate confidence.",
        "Provider may be unavailable."
      ],
      relatedEntityId: run.runId,
      relatedPage: "/llm-agents"
    })
  );
}

export function buildAgentAuditTraces(context: AgentAuditSourceContext): AgentDecisionTrace[] {
  return [
    ...safeArray(context.debateMessages).map((message) => auditDeterministicAgentDecision(message, context.thesis)),
    ...auditLLMAdvisoryRun(context.llmRun)
  ];
}
