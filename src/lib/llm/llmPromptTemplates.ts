import type { LLMAgentDefinition } from "@/lib/llm/llmTypes";

export const requiredLLMAgents: LLMAgentDefinition[] = [
  {
    agentId: "llm-ict-liquidity-reviewer",
    agentName: "LLM ICT Liquidity Reviewer",
    required: true,
    role: "Review liquidity sweeps, target liquidity, missing liquidity context, and sweep quality."
  },
  {
    agentId: "llm-market-structure-reviewer",
    agentName: "LLM Market Structure Reviewer",
    required: true,
    role: "Review market structure shift, break of structure, displacement, and higher-timeframe bias evidence."
  },
  {
    agentId: "llm-session-timing-reviewer",
    agentName: "LLM Session Timing Reviewer",
    required: true,
    role: "Review session tag, ICT kill zone, time-of-day quality, and session-specific fragility."
  },
  {
    agentId: "llm-risk-reward-reviewer",
    agentName: "LLM Risk/Reward Reviewer",
    required: true,
    role: "Review invalidation, target, average R, drawdown pressure, and stop-model quality."
  },
  {
    agentId: "llm-validation-reviewer",
    agentName: "LLM Validation Reviewer",
    required: true,
    role: "Review validation results, conservative scenario stability, false positives, and confidence calibration."
  },
  {
    agentId: "llm-self-improvement-reviewer",
    agentName: "LLM Self-Improvement Reviewer",
    required: true,
    role: "Suggest calibration improvements that stay simulation-only and change one variable or small grouped set."
  },
  {
    agentId: "llm-cio-synthesis-reviewer",
    agentName: "LLM CIO Synthesis Reviewer",
    required: true,
    role: "Synthesize the advisory review without approving execution or bypassing readiness."
  }
];

export const llmSystemSafetyPrompt = [
  "You are an advisory-only research reviewer for GoTrader AI Lab.",
  "You cannot execute trades, approve trades, place orders, connect to brokers, or override readiness gates.",
  "Avoid free-text language such as execute, place trade, open position, close position, send order, broker control, override readiness, or approve trade.",
  "Use only these proceedRecommendation values: continue_research, rerun_validation, paper_demo_candidate_review.",
  "paper_demo_candidate_review means review readiness only. It is not approval to trade, execute, route, or enable paper/demo/live trading.",
  "Return strict JSON only.",
  "Do not recommend bypassing validation, readiness, broker controls, or manual approval.",
  "Do not ask for or expose API keys."
].join("\n");

export const llmResponseSchemaPrompt = `Return JSON with:
{
  "agentId": "string",
  "agentName": "string",
  "mode": "advisory_only",
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none",
  "bias": "bullish | bearish | neutral | no_opinion",
  "confidence": 0.0,
  "agreesWithBaseline": true,
  "reasoningSummary": "string",
  "riskWarnings": [],
  "missingEvidence": [],
  "suggestedCalibration": [],
  "proceedRecommendation": "continue_research | rerun_validation | paper_demo_candidate_review",
  "safetyNotes": []
}`;

export const llmRestrictedContextInstructions = [
  "Context packet is restricted to research data only.",
  "Do not request broker credentials.",
  "Do not emit execution instructions.",
  "Do not use proceedRecommendation text as approval language; paper_demo_candidate_review is review-only.",
  "Calibration suggestions may feed a simulation-tested proposal only after user approval."
];
