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
  },
  {
    agentId: "llm-session-levels-reviewer",
    agentName: "LLM Session Levels Reviewer",
    required: true,
    role: "Review prior day/week/month, overnight, Globex, and opening-range levels for meaningful futures liquidity sweeps."
  },
  {
    agentId: "llm-auction-volume-profile-reviewer",
    agentName: "LLM Auction/Volume Profile Reviewer",
    required: true,
    role: "Review VWAP, anchored VWAP, VPOC, VAH, VAL, and acceptance/rejection evidence."
  },
  {
    agentId: "llm-macro-event-risk-reviewer",
    agentName: "LLM Macro Event Risk Reviewer",
    required: true,
    role: "Review scheduled macro risk, Fed speakers, and event proximity that can distort normal ICT behavior."
  },
  {
    agentId: "llm-intermarket-confirmation-reviewer",
    agentName: "LLM Intermarket Confirmation Reviewer",
    required: true,
    role: "Review ES/NQ, YM/ES, VIX, DXY, yields, bonds, crude, and gold context for confirmation or conflict."
  },
  {
    agentId: "llm-positioning-gamma-reviewer",
    agentName: "LLM Positioning/Gamma Reviewer",
    required: true,
    role: "Review COT, put/call, gamma levels, dealer gamma flip, and higher-timeframe positioning risk."
  },
  {
    agentId: "llm-volatility-regime-reviewer",
    agentName: "LLM Volatility Regime Reviewer",
    required: true,
    role: "Review VIX, ATR/range expansion, realized volatility, stop assumptions, and target expectations."
  },
  {
    agentId: "llm-order-flow-planning-reviewer",
    agentName: "LLM Order Flow Planning Reviewer",
    required: true,
    role: "Review missing DOM, footprint, delta, cumulative delta, and large-print evidence as planned later context only."
  }
];

export const requiredLLMAgentIds = requiredLLMAgents.map((agent) => agent.agentId);

export const requiredLLMReviewerRosterPrompt = requiredLLMAgents
  .map((agent, index) => `${index + 1}. ${agent.agentId} - ${agent.agentName}: ${agent.role}`)
  .join("\n");

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
  "responses": [
    {
      "agentId": "one of the required reviewer IDs",
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
    }
  ]
}

Return exactly ${requiredLLMAgents.length} reviewer objects. Required reviewers:
${requiredLLMReviewerRosterPrompt}

The order-flow planning reviewer is advisory/planning only. It should identify missing order-flow evidence and must not require live DOM, footprint, delta, cumulative delta, or large-print feeds yet.`;

export const llmRestrictedContextInstructions = [
  "Context packet is restricted to research data only.",
  "If grinchPhase1Summary is present, review it as a layered ICT profile: HTF bias, dealing range, opening-price equilibrium, PD hierarchy, Model 1 timing, targets, and invalidation. It is advisory context only.",
  "If grinchReversalProfileSummary is present, review it as Phase 2 Reversal Profile context: failed London interaction with 12AM Open, NY reversal timing, first target back to 12AM, and continuation quality. It cannot create execution authority.",
  "Respect evidenceQualitySummary labels: real_imported and derived_from_real can support reasoning; mock, planned, and unavailable evidence must be treated as missing or weak evidence.",
  "Do not request broker credentials.",
  "Do not emit execution instructions.",
  "Do not use proceedRecommendation text as approval language; paper_demo_candidate_review is review-only.",
  "Calibration suggestions may feed a simulation-tested proposal only after user approval."
];
