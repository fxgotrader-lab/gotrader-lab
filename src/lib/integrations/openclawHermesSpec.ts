import type { OpenClawHermesAdvisorySpec } from "@/lib/integrations/openclawHermesTypes";

export const openClawHermesAdvisorySpec: OpenClawHermesAdvisorySpec = {
  status: "planning_only",
  openClawConnection: "not_connected",
  hermesConnection: "not_connected",
  role: "research_reviewer_only",
  brokerAuthority: "none",
  executionAuthority: "none",
  readinessOverrideAuthority: "none",
  allowedReviewInputs: [
    "ICT context",
    "agent debate",
    "CIO thesis",
    "validation results",
    "research quality grade",
    "readiness gate status",
    "risk notes"
  ],
  prohibitedActions: [
    "place trades",
    "approve trades",
    "override readiness gate",
    "connect to broker",
    "change live settings",
    "execute handoff",
    "control go-trader"
  ],
  exampleRequest: {
    thesisId: "thesis_sim_001",
    symbol: "NQ",
    timeframe: "5m",
    ictContext: {
      bias: "bearish",
      confluenceScore: 0.62,
      narrativeSummary:
        "Mock ICT context shows a liquidity sweep above prior swing high, bearish MSS, and price trading from premium."
    },
    cioThesis: {
      bias: "bearish",
      confidence: 0.68,
      summary: "CIO favors a simulated short thesis toward sell-side liquidity if premium rejection holds.",
      riskNotes: "Invalid above swept high. Research-only, no order execution."
    },
    validationSummary: {
      validationId: "validation_001",
      generatedAt: "2026-05-25T00:00:00.000Z",
      readinessStatus: "yellow",
      readinessScore: 58,
      conservativeScenarioStatus: "yellow",
      maxDrawdownR: 2.4,
      confidenceCalibration: 0.61
    },
    researchQualityGrade: {
      reviewId: "research_quality_001",
      generatedAt: "2026-05-25T00:00:00.000Z",
      readinessGrade: "Research Ready",
      falsePositiveCount: 2,
      topWeaknesses: ["London session sample remains thin", "FVG invalidation model underperformed"]
    },
    readinessStatus: {
      state: "Research Ready",
      failedRequirements: ["Research Quality is not Paper-Demo Candidate", "Conservative scenario stability failed"],
      brokerExecutionDisabled: true
    },
    mode: "simulation",
    advisoryOnly: true
  },
  exampleResponse: {
    advisoryAgent: "OpenClaw",
    agreeWithThesis: false,
    riskWarnings: [
      "Conservative validation has not reached Paper-Demo Candidate.",
      "False-positive patterns remain present in recent simulation review."
    ],
    missingEvidence: ["Repeatable NY AM session stability", "Clear stop-model selection"],
    recommendedCalibration: [
      "Rerun validation with conservative confluence >= 0.55.",
      "Compare latest swing and FVG invalidation before changing target R."
    ],
    advisoryConfidence: 0.74,
    proceedRecommendation: "rerun_validation",
    executionAuthority: "none",
    readinessOverrideAuthority: "none"
  }
};
