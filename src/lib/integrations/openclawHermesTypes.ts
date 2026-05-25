import type { ICTContext, MarketBias, Timeframe, FuturesSymbol } from "@/lib/types";

export type AdvisoryAgentName = "OpenClaw" | "Hermes" | "openclaw_hermes_local_bridge_mock";
export type AdvisoryConnectionStatus = "not_connected";
export type AdvisoryPlanningStatus = "planning_only";
export type AdvisoryProceedRecommendation = "continue_research" | "rerun_validation" | "paper_demo_candidate_review";
export type AdvisoryRequestMode = "advisory_only";
export type AdvisoryAuthority = "none";
export type AdvisoryPacketSource = "gotrader_ai_lab";
export type AdvisoryRequestedTask =
  | "review_thesis"
  | "identify_missing_confluence"
  | "identify_risk_concerns"
  | "suggest_calibration_change"
  | "recommend_continue_research"
  | "recommend_rerun_validation"
  | "recommend_paper_demo_candidate_review";

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

export interface AdvisoryICTContextSummary {
  narrativeSummary: string;
  bias: MarketBias;
  confluenceScore: number;
  killZone: string;
  premiumDiscount: string;
  latestSwingHigh?: number;
  latestSwingLow?: number;
  hasBullishMSS: boolean;
  hasBearishMSS: boolean;
  hasBullishBOS: boolean;
  hasBearishBOS: boolean;
  liquiditySweepCount: number;
  fairValueGapCount: number;
}

export interface AdvisoryAgentDebateSummary {
  agentId: string;
  agentName: string;
  bias: MarketBias;
  confidence: number;
  weight?: number;
  reasoning: string;
  recommendation?: string;
  supportingFactors: string[];
  warningFactors: string[];
}

export interface AdvisoryCIOThesisSummary {
  bias: MarketBias;
  confidence: number;
  thesisSummary: string;
  reasoningSummary: string;
  invalidationLevel: number;
  targetLiquidity: number;
}

export interface AdvisoryRequestPacket {
  packetId: string;
  timestamp: string;
  source: AdvisoryPacketSource;
  mode: AdvisoryRequestMode;
  executionAuthority: AdvisoryAuthority;
  brokerAuthority: AdvisoryAuthority;
  readinessOverrideAuthority: AdvisoryAuthority;
  thesisId: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  ictContextSummary: AdvisoryICTContextSummary;
  internalAgentDebateSummaries: AdvisoryAgentDebateSummary[];
  cioThesis: AdvisoryCIOThesisSummary;
  validationSummary?: AdvisoryValidationSummary;
  researchQualityGrade?: AdvisoryResearchQualitySummary;
  readinessStatus?: AdvisoryReadinessSummary;
  riskNotes: string;
  requestedAdvisoryTasks: AdvisoryRequestedTask[];
  safetyNotice: "This packet is advisory only. It cannot execute trades or override readiness gates.";
}

export interface AdvisoryRequestPacketValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AdvisoryResponse {
  responseId: string;
  packetId: string;
  timestamp: string;
  advisoryAgent: AdvisoryAgentName;
  mode: AdvisoryRequestMode;
  executionAuthority: AdvisoryAuthority;
  brokerAuthority: AdvisoryAuthority;
  readinessOverrideAuthority: AdvisoryAuthority;
  agreeWithThesis: boolean | null;
  advisoryConfidence: number;
  riskWarnings: string[];
  missingEvidence: string[];
  recommendedCalibration: string[];
  proceedRecommendation: AdvisoryProceedRecommendation;
  notes: string;
}

export interface AdvisoryResponseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AdvisoryResponseImportResult {
  response?: AdvisoryResponse;
  validation: AdvisoryResponseValidationResult;
}
