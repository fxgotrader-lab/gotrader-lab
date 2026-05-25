import type { ICTContext, MarketBias, Timeframe, FuturesSymbol } from "@/lib/types";

export type AdvisoryAgentName = "OpenClaw" | "Hermes";
export type AdvisoryConnectionStatus = "not_connected";
export type AdvisoryPlanningStatus = "planning_only";
export type AdvisoryProceedRecommendation = "continue_research" | "rerun_validation" | "paper_demo_candidate_review";

export interface AdvisoryValidationSummary {
  validationId?: string;
  generatedAt?: string;
  readinessStatus?: string;
  readinessScore?: number;
  conservativeScenarioStatus?: string;
  maxDrawdownR?: number;
  confidenceCalibration?: number;
}

export interface AdvisoryResearchQualitySummary {
  reviewId?: string;
  generatedAt?: string;
  readinessGrade?: string;
  falsePositiveCount?: number;
  topWeaknesses?: string[];
}

export interface AdvisoryReadinessSummary {
  state: string;
  failedRequirements: string[];
  brokerExecutionDisabled: true;
}

export interface OpenClawHermesAdvisoryRequest {
  thesisId: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  ictContext: Partial<ICTContext>;
  cioThesis: {
    bias: MarketBias;
    confidence: number;
    summary: string;
    riskNotes: string;
  };
  validationSummary: AdvisoryValidationSummary;
  researchQualityGrade: AdvisoryResearchQualitySummary;
  readinessStatus: AdvisoryReadinessSummary;
  mode: "simulation";
  advisoryOnly: true;
}

export interface OpenClawHermesAdvisoryResponse {
  advisoryAgent: AdvisoryAgentName;
  agreeWithThesis: boolean;
  riskWarnings: string[];
  missingEvidence: string[];
  recommendedCalibration: string[];
  advisoryConfidence: number;
  proceedRecommendation: AdvisoryProceedRecommendation;
  executionAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface OpenClawHermesAdvisorySpec {
  status: AdvisoryPlanningStatus;
  openClawConnection: AdvisoryConnectionStatus;
  hermesConnection: AdvisoryConnectionStatus;
  role: "research_reviewer_only";
  brokerAuthority: "none";
  executionAuthority: "none";
  readinessOverrideAuthority: "none";
  allowedReviewInputs: string[];
  prohibitedActions: string[];
  exampleRequest: OpenClawHermesAdvisoryRequest;
  exampleResponse: OpenClawHermesAdvisoryResponse;
}
