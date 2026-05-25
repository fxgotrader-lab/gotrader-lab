import { requiredLLMAgents } from "@/lib/llm/llmPromptTemplates";
import type { LLMAgentResponse, LLMProvider, LLMResearchContextPacket } from "@/lib/llm/llmTypes";
import { providerStatusForMode } from "@/lib/llm/llmProvider";

const biasFor = (context: LLMResearchContextPacket): LLMAgentResponse["bias"] =>
  context.cioThesis?.bias ?? context.ictContextSummary?.bias ?? "no_opinion";

export const mockLLMProvider: LLMProvider = {
  mode: "mock_llm",
  label: "Mock LLM provider",
  status: () => providerStatusForMode("mock_llm"),
  async runAgents(context) {
    return requiredLLMAgents.map((agent, index) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      mode: "advisory_only",
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none",
      bias: index === 5 ? "no_opinion" : biasFor(context),
      confidence: Math.max(0.42, Math.min(0.78, (context.cioThesis?.confidence ?? 0.55) - index * 0.01)),
      agreesWithBaseline: index === 5 ? null : true,
      reasoningSummary: `${agent.agentName} mock review found the context usable for UI testing only. This is not a real LLM advisory review.`,
      riskWarnings: [
        "Mock response only; do not use for Paper-Demo Candidate readiness.",
        "Broker execution remains disabled."
      ],
      missingEvidence: context.validationSummary ? [] : ["Validation summary is missing."],
      suggestedCalibration:
        index === 5
          ? ["If drawdown remains high, test a slightly higher confidence threshold in simulation."]
          : [],
      proceedRecommendation: context.validationSummary ? "rerun_validation" : "continue_research",
      safetyNotes: [
        "Advisory only.",
        "No execution authority.",
        "No readiness override authority."
      ]
    }));
  }
};
