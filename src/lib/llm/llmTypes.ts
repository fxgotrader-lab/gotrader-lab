import type { MarketBias, Timeframe, FuturesSymbol } from "@/lib/types";

export type LLMResearchMode = "llm_required";
export type LLMProviderMode =
  | "deterministic_fallback"
  | "mock_llm"
  | "local_command"
  | "future_api";
export type LLMAgentBias = MarketBias | "no_opinion";
export type LLMProceedRecommendation =
  | "continue_research"
  | "rerun_validation"
  | "paper_demo_candidate_review";
export type LLMAuthority = "none";
export type LLMAdvisoryRunStatus =
  | "not_configured"
  | "mock_complete"
  | "fallback_complete"
  | "complete"
  | "rejected"
  | "error";

export interface LLMAgentDefinition {
  agentId: string;
  agentName: string;
  required: true;
  role: string;
}

export interface LLMICTContextSummary {
  narrativeSummary?: string;
  bias?: MarketBias;
  confluenceScore?: number;
  killZone?: string;
  premiumDiscount?: string;
  latestSwingHigh?: number;
  latestSwingLow?: number;
  hasBullishMSS?: boolean;
  hasBearishMSS?: boolean;
  hasBullishBOS?: boolean;
  hasBearishBOS?: boolean;
  liquiditySweepCount?: number;
  fairValueGapCount?: number;
}

export interface LLMBaselineDebateSummary {
  agentId: string;
  agentName: string;
  bias: MarketBias;
  confidence: number;
  reasoning: string;
}

export interface LLMValidationSummary {
  validationId?: string;
  generatedAt?: string;
  readinessStatus?: string;
  readinessScore?: number;
  conservativeScenarioStatus?: string;
  maxDrawdownR?: number;
  confidenceCalibration?: number;
}

export interface LLMResearchQualitySummary {
  reviewId?: string;
  generatedAt?: string;
  readinessGrade?: string;
  topWeaknesses?: string[];
  falsePositiveCount?: number;
}

export interface LLMReadinessSummary {
  state: string;
  failedRequirements: string[];
  brokerExecutionDisabled: true;
}

export interface LLMSimulationRunbookSummary {
  verifiedAt?: string;
  completedChecks: number;
  totalChecks: number;
  brokerExecutionSkipped: boolean;
  tradesZero: boolean;
  positionsZero: boolean;
}

export interface LLMResearchContextPacket {
  packetId: string;
  timestamp: string;
  source: "gotrader_ai_lab";
  mode: "advisory_only";
  researchMode: LLMResearchMode;
  providerMode: LLMProviderMode;
  executionAuthority: LLMAuthority;
  brokerAuthority: LLMAuthority;
  readinessOverrideAuthority: LLMAuthority;
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  ictContextSummary?: LLMICTContextSummary;
  deterministicICTFacts: string[];
  internalBaselineAgentDebate: LLMBaselineDebateSummary[];
  cioThesis?: {
    thesisId: string;
    bias: MarketBias;
    confidence: number;
    summary: string;
    reasoningSummary: string;
  };
  validationSummary?: LLMValidationSummary;
  researchQualityGrade?: LLMResearchQualitySummary;
  readinessState?: LLMReadinessSummary;
  simulationRunbookStatus?: LLMSimulationRunbookSummary;
  riskNotes?: string;
  safetyConstraints: string[];
}

export interface LLMAgentResponse {
  agentId: string;
  agentName: string;
  mode: "advisory_only";
  executionAuthority: LLMAuthority;
  brokerAuthority: LLMAuthority;
  readinessOverrideAuthority: LLMAuthority;
  bias: LLMAgentBias;
  confidence: number;
  agreesWithBaseline: boolean | null;
  reasoningSummary: string;
  riskWarnings: string[];
  missingEvidence: string[];
  suggestedCalibration: string[];
  proceedRecommendation: LLMProceedRecommendation;
  safetyNotes: string[];
}

export interface LLMResponseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface LLMProviderStatus {
  providerMode: LLMProviderMode;
  configured: boolean;
  command?: string;
  statusMessage: string;
  secureBoundary: "local_command" | "backend_endpoint" | "supabase_edge_function" | "future_secure_service" | "none";
}

export interface LLMProvider {
  mode: LLMProviderMode;
  label: string;
  status(): LLMProviderStatus;
  runAgents(context: LLMResearchContextPacket): Promise<LLMAgentResponse[]>;
}

export interface LLMAdvisoryRun {
  runId: string;
  timestamp: string;
  researchMode: LLMResearchMode;
  providerMode: LLMProviderMode;
  providerConfigured: boolean;
  status: LLMAdvisoryRunStatus;
  realProvider: boolean;
  advisoryPassed: boolean;
  contextPacketId: string;
  responses: LLMAgentResponse[];
  validationResults: Record<string, LLMResponseValidationResult>;
  unsafeResponseRejections: number;
  readinessImpact: string;
  safetyNotice: "LLM agents are advisory only. They cannot execute trades or override readiness gates.";
}

export interface LLMResearchState {
  researchMode: LLMResearchMode;
  providerMode: LLMProviderMode;
  latestRunId?: string;
  runs: LLMAdvisoryRun[];
  unsafeResponseRejections: number;
  deterministicFallbackEnabled: true;
  mockModeAllowed: true;
  safetyNotice: "LLM agents are required for real research mode, but advisory only.";
}
