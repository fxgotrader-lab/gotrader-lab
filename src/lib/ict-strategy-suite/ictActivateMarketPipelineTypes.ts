import type { IctCurrentRead, IctReadinessSummary } from "./ictCurrentReadTypes";
import type { IctAdvisorPacket } from "./ictAdvisorTypes";
import type {
  IctAnalysisDepthStatus,
  IctAnalysisTimeframe,
  IctMarketAnalysisContext,
  IctMultiTimeframeContextStatus,
  IctWeeklyBiasDirection,
  IctWeeklyBiasStatus
} from "./ictMarketAnalysisContextTypes";
import type { IctLatestMonteCarloSnapshot } from "./ictLatestResearchStateTypes";
import type {
  IctDetectedOpportunity,
  IctOpportunityLaneRecommendation,
  IctOpportunityQuality,
  IctOpportunityStage,
  IctOpportunityType
} from "./ictOpportunityDetectionTypes";
import type { IctResearchHypothesis, IctResearchHypothesisStatus } from "./ictSelfImprovementTypes";
import type { IctResearchSignal } from "./ictSignalContractTypes";

export type IctActivateMarketStepId =
  | "resolve_symbol"
  | "check_mt5_readonly"
  | "load_display_candles"
  | "load_analysis_m5"
  | "load_analysis_m15"
  | "load_analysis_h1"
  | "load_analysis_h4"
  | "load_analysis_daily"
  | "load_analysis_weekly"
  | "load_weekly_bias"
  | "build_multi_timeframe_context"
  | "build_current_read"
  | "detect_session_model"
  | "run_universal_recognition"
  | "detect_market_opportunity"
  | "queue_research_hypothesis"
  | "run_phase_one"
  | "run_phase_two"
  | "run_smt"
  | "run_news_session_risk"
  | "apply_approved_profile"
  | "build_signal_contract"
  | "build_operator_workflow"
  | "check_cmd_paper_eligibility"
  | "load_latest_monte_carlo_summary"
  | "save_latest_state"
  | "complete";

export type IctActivateMarketStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export type IctActivateMarketStatus =
  | "idle"
  | "running"
  | "completed"
  | "partial"
  | "unavailable"
  | "failed";

export interface IctActivateMarketStep {
  id: IctActivateMarketStepId;
  label: string;
  status: IctActivateMarketStepStatus;
  message?: string;
  warning?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface IctActivateMarketOperatorWorkflow {
  recommendedAction: string;
  reason: string;
  heavyActionDeferred: true;
  autoStarted: false;
  executionAllowed: false;
}

export interface IctActivateMarketLatestSummary {
  activationTimestamp: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  displayTimeframe?: string;
  analysisDepthStatus?: IctAnalysisDepthStatus;
  analysisTimeframesUsed?: IctAnalysisTimeframe[];
  missingTimeframes?: IctAnalysisTimeframe[];
  modelName?: string;
  modelLane?: string;
  opportunityType?: IctOpportunityType;
  opportunityStage?: IctOpportunityStage;
  opportunityQuality?: IctOpportunityQuality;
  opportunityLaneRecommendation?: IctOpportunityLaneRecommendation;
  recognitionTier?: IctCurrentRead["recognitionTier"];
  scalpStatus?: IctCurrentRead["scalpStatus"];
  pdArrayFocus?: string;
  selfImprovementHypothesisQueued?: boolean;
  selfImprovementHypothesisStatus?: IctResearchHypothesisStatus;
  selfImprovementHypothesisReason?: string;
  nextAction?: string;
  executionAllowed: false;
  researchOnly: true;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctActivateMarketResult {
  researchOnly: true;
  status: IctActivateMarketStatus;
  generatedAt: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  steps: IctActivateMarketStep[];

  advisorPacket?: IctAdvisorPacket;
  marketAnalysisContext?: IctMarketAnalysisContext;
  currentRead?: IctCurrentRead;
  opportunity?: IctDetectedOpportunity;
  selfImprovementHypothesis?: IctResearchHypothesis;
  signalContract?: IctResearchSignal;
  operatorWorkflow?: IctActivateMarketOperatorWorkflow;

  cmdPaperEligibility?: {
    eligible: boolean;
    reason: string;
  };

  selfImprovementQueue?: {
    queued: boolean;
    reason: string;
    journalEventId?: string;
    status?: IctResearchHypothesisStatus;
  };

  latestMonteCarlo?: {
    status: "saved" | "missing";
    summary?: IctLatestMonteCarloSnapshot;
    reason: string;
    recommendedMaxRiskReason: string;
  };

  summary: {
    dataStatus: string;
    modelDetected: boolean;
    modelName?: string;
    modelState?: string;
    modelLane?: string;
    opportunityDetected?: boolean;
    opportunityType?: IctOpportunityType;
    opportunityStage?: IctOpportunityStage;
    opportunityQuality?: IctOpportunityQuality;
    opportunityLaneRecommendation?: IctOpportunityLaneRecommendation;
    opportunityNextAction?: string;
    recognitionTier?: IctCurrentRead["recognitionTier"];
    scalpStatus?: IctCurrentRead["scalpStatus"];
    pdArrayFocus?: string;
    recognitionOpportunitySummary?: string;
    selfImprovementHypothesisQueued?: boolean;
    selfImprovementHypothesisStatus?: IctResearchHypothesisStatus;
    selfImprovementHypothesisReason?: string;
    displayTimeframe?: string;
    analysisTimeframesRequested?: IctAnalysisTimeframe[];
    analysisTimeframesLoaded?: IctAnalysisTimeframe[];
    requiredTimeframesLoaded?: boolean;
    analysisDepthStatus?: IctAnalysisDepthStatus;
    multiTimeframeContextStatus?: IctMultiTimeframeContextStatus;
    analysisTimeframesUsed?: IctAnalysisTimeframe[];
    missingTimeframes?: IctAnalysisTimeframe[];
    weeklyBiasStatus?: IctWeeklyBiasStatus;
    weeklyBiasDirection?: IctWeeklyBiasDirection;
    weeklyBiasReason?: string;
    paperSimEligibilityStatus?: IctCurrentRead["paperSimEligibilityStatus"];
    paperSimEligibilityReason?: string;
    paperSimAllowed?: boolean;
    paperOnly?: boolean;
    readinessSummary: IctReadinessSummary;
    latestMonteCarloStatus?: "saved" | "missing";
    latestMonteCarloReason?: string;
    recommendedMaxRiskPerTradePct?: number;
    recommendedMaxRiskStatus?: "available" | "unavailable";
    recommendedMaxRiskReason?: string;
    nextAction?: string;
    executionAllowed: false;
  };

  debug?: IctCurrentRead["debug"];

  warnings: string[];
  errors: string[];

  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };

  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctActivateMarketCallbacks {
  onStepUpdate?: (step: IctActivateMarketStep, allSteps: IctActivateMarketStep[]) => void;
}
