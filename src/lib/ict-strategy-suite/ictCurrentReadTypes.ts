import type { IctBias, IctLocation, IctSide } from "./ictAdvisorTypes";
import type { IctApprovedCandidateStatus, IctHtfAlignmentBreakdown } from "./ictApprovedSetupProfileTypes";
import type { IctCmdIndependentDateGateStatus } from "./ictCmdIndependentDateGateTypes";
import type {
  IctAnalysisDepthStatus,
  IctAnalysisTimeframe,
  IctMultiTimeframeContextStatus,
  IctWeeklyBiasDirection,
  IctWeeklyBiasStatus
} from "./ictMarketAnalysisContextTypes";
import type { IctMonteCarloRobustnessRating } from "./ictMonteCarloTypes";
import type {
  IctDetectedOpportunity,
  IctOpportunityDirection,
  IctOpportunityLaneRecommendation,
  IctOpportunityQuality,
  IctOpportunityStage,
  IctOpportunityTradeIdea,
  IctOpportunityType
} from "./ictOpportunityDetectionTypes";
import type { IctResearchHypothesis, IctResearchHypothesisStatus } from "./ictSelfImprovementTypes";
import type {
  IctRecognitionTier,
  IctScalpSetupStatus,
  IctUniversalRecognitionResult
} from "./ictUniversalRecognitionTypes";
import type {
  IctDataDepthStatus,
  IctSessionDirectionalRead,
  IctSessionModelName,
  IctSessionModelState,
  IctSessionNarrativeProfile
} from "./ictSessionNarrativeTypes";
import type { CurrentOpportunity, CurrentOpportunitySummary } from "../currentOpportunity/currentOpportunityTypes";

export type IctCurrentReadPacketSource =
  | "live_mt5"
  | "manual_replay"
  | "scorecard"
  | "default"
  | "unavailable";

export type IctCurrentReadDataStatus = "ready" | "missing" | "stale" | "unavailable";

export type IctModelQualityLane =
  | "approved"
  | "paper_watchlist"
  | "watchlist"
  | "rejected"
  | "no_trade";

export interface IctReadinessSummary {
  researchReadiness: "ready" | "partial" | "not_ready";
  paperReadiness: "eligible" | "not_eligible" | "partial";
  executionReadiness: "disabled";
  reasons: string[];
}

export type IctPaperSimEligibilityStatus = "eligible" | "not_eligible" | "partial";
export type IctLatestMonteCarloStatus = "saved" | "missing";

export interface IctCurrentRead {
  researchOnly: true;
  packetSource: IctCurrentReadPacketSource;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  displayTimeframe?: string;
  displayTimeframeRole?: "chart_display_reference_only";
  analysisTimeframesRequested?: IctAnalysisTimeframe[];
  analysisTimeframesLoaded?: IctAnalysisTimeframe[];
  requiredTimeframesLoaded?: boolean;
  analysisTimeframesUsed?: IctAnalysisTimeframe[];
  analysisDepthStatus?: IctAnalysisDepthStatus;
  multiTimeframeContextStatus?: IctMultiTimeframeContextStatus;
  missingTimeframes?: IctAnalysisTimeframe[];
  htfBiasSource?: IctAnalysisTimeframe[];
  sessionModelSourceTimeframe?: IctAnalysisTimeframe;
  confirmationSourceTimeframe?: IctAnalysisTimeframe;
  weeklyBiasStatus?: IctWeeklyBiasStatus;
  weeklyBiasDirection?: IctWeeklyBiasDirection;
  weeklyBiasReason?: string;
  htfTimeframes: string[];
  htfAlignment?: IctHtfAlignmentBreakdown;
  dataStatus: IctCurrentReadDataStatus;
  candleCount?: number;
  htfStatus?: Record<string, "ready" | "missing" | "unavailable">;
  bestPhase1Setup?: string;
  bestPhase2Setup?: string;
  bestSetup?: string;
  side: IctSide;
  approvedStatus: IctApprovedCandidateStatus;
  modelQualityLane: IctModelQualityLane;
  paperWatchlistEligible: boolean;
  paperWatchlistModelName?: IctSessionModelName;
  paperWatchlistReason?: string;
  paperWatchlistEvidenceSummary?: string;
  cmdIndependentDateGateRequired?: boolean;
  cmdIndependentDateGateStatus?: IctCmdIndependentDateGateStatus;
  cmdIndependentDateGateReason?: string;
  cmdIndependentDateGateNextAction?: string;
  paperSimEligibilityStatus?: IctPaperSimEligibilityStatus;
  paperSimEligibilityReason?: string;
  paperSimAllowed: boolean;
  paperOnly: boolean;
  readinessSummary: IctReadinessSummary;
  executionAllowed: false;
  approvalScore?: number;
  confidence?: number;
  rrEstimate?: number;
  target?: number;
  invalidation?: number;
  bias?: IctBias;
  smtStatus?: string;
  riskStatus?: string;
  dealingRangeLocation?: IctLocation;
  drawOnLiquidity?: string;
  liquiditySwept?: string;
  fvgStatus?: string;
  displacementStatus?: string;
  entryZone?: string;
  latestReplayStatus?: string;
  latestMonteCarloRobustness?: IctMonteCarloRobustnessRating;
  latestMonteCarloRiskOfRuinPct?: number;
  latestMonteCarloRecommendedRiskPct?: number;
  latestMonteCarloGeneratedAt?: string;
  latestMonteCarloUsableOutcomes?: number;
  latestMonteCarloStatus: IctLatestMonteCarloStatus;
  latestMonteCarloReason: string;
  recommendedMaxRiskStatus: "available" | "unavailable";
  recommendedMaxRiskReason: string;
  latestScorecardBestSymbol?: string;
  latestScorecardResearchPreferredSymbols?: string[];
  latestResearchStateUpdatedAt?: string;
  latestResearchStateNote?: string;
  sessionNarrativeProfile?: IctSessionNarrativeProfile;
  sessionDirectionalRead?: IctSessionDirectionalRead;
  sessionNarrativeConfidence?: number;
  modelDetected?: boolean;
  modelName?: IctSessionModelName;
  modelState?: IctSessionModelState;
  modelDirection?: IctSessionDirectionalRead;
  modelConfidence?: number;
  modelReasons?: string[];
  modelMissingEvidence?: string[];
  opportunity?: IctDetectedOpportunity;
  universalRecognition?: IctUniversalRecognitionResult;
  recognitionTier: IctRecognitionTier;
  knownModelName?: string;
  knownModelState?: string;
  scalpStatus?: IctScalpSetupStatus;
  scalpDirection?: "bullish" | "bearish" | "neutral";
  scalpTarget?: number;
  scalpInvalidation?: number;
  scalpRR?: number;
  pdArrayFocus?: string;
  recognitionOpportunitySummary: string;
  opportunitySummary: string;
  currentOpportunitySummary?: CurrentOpportunitySummary;
  currentOpportunities?: CurrentOpportunity[];
  opportunityDetected: boolean;
  opportunityType: IctOpportunityType;
  opportunityStage: IctOpportunityStage;
  opportunityQuality: IctOpportunityQuality;
  opportunityDirection: IctOpportunityDirection;
  opportunityModelName?: string;
  opportunityLaneRecommendation: IctOpportunityLaneRecommendation;
  opportunityNextAction: string;
  opportunityMissingEvidence: string[];
  opportunityBlockers: string[];
  opportunityTradeIdea?: IctOpportunityTradeIdea;
  selfImprovementHypothesis?: IctResearchHypothesis;
  selfImprovementHypothesisQueued: boolean;
  selfImprovementHypothesisStatus?: IctResearchHypothesisStatus;
  selfImprovementHypothesisReason?: string;
  selfImprovementNextValidation?: string;
  sessionMitigationDetected?: boolean;
  fvgTargetDetected?: boolean;
  fvgTargetDirection?: "premium" | "discount" | "unknown";
  dataDepthStatus?: IctDataDepthStatus;
  availableLookbackDays?: number;
  requestedLookbackDays?: number;
  sessionTopReasons?: string[];
  sessionNarrativeStatus?: IctSessionNarrativeProfile | "unknown";
  modelDetectionStatus?: "detected" | "not_detected" | "not_run";
  fvgTargetStatus?: "detected" | "missing";
  fvgTargetReason?: string;
  targetConstructionStatus?: "constructed" | "missing";
  targetConstructionReason?: string;
  invalidationConstructionStatus?: "constructed" | "missing";
  invalidationConstructionReason?: string;
  rrConstructionStatus?: "constructed" | "missing";
  rrConstructionReason?: string;
  smtReason?: string;
  riskReason?: string;
  topReasons: string[];
  nextAction: string;
  debug: {
    candleCount: number;
    primaryTimeframeAvailable: boolean;
    htfTimeframesAvailable: string[];
    phase1SignalCount: number;
    phase2SignalCount: number;
    approvedStatus: IctApprovedCandidateStatus;
    rejectionReasonsCount: number;
    noTradeReasonsCount: number;
    lastEvaluationAt: string;
    packetSource: IctCurrentReadPacketSource;
    sourceFingerprint?: string;
    journalStatus?: string;
    selectedSessionDate?: string;
    selectedSessionMode?: string;
    sessionCandlesCount?: number;
    sessionNarrativeStatus?: string;
    modelDetectorUsed?: string;
    opportunityDetectorUsed?: string;
    universalRecognitionTier?: IctRecognitionTier;
    scalpStatus?: IctScalpSetupStatus;
    pdArrayCount?: number;
    opportunityType?: IctOpportunityType;
    opportunityStage?: IctOpportunityStage;
    opportunityQuality?: IctOpportunityQuality;
    opportunityLaneRecommendation?: IctOpportunityLaneRecommendation;
    selfImprovementHypothesisStatus?: IctResearchHypothesisStatus;
    selfImprovementHypothesisReason?: string;
    cmdIndependentDateGateStatus?: IctCmdIndependentDateGateStatus;
    cmdIndependentDateGateReason?: string;
    fvgTargetStatus?: string;
    targetConstructionStatus?: string;
    invalidationConstructionStatus?: string;
    rrConstructionStatus?: string;
    smtStatus?: string;
    riskStatus?: string;
    hydrationSource?: string;
    hydrationWarning?: string;
    displayTimeframe?: string;
    analysisTimeframesRequested?: IctAnalysisTimeframe[];
    analysisTimeframesLoaded?: IctAnalysisTimeframe[];
    requiredTimeframesLoaded?: boolean;
    analysisTimeframesUsed?: IctAnalysisTimeframe[];
    analysisDepthStatus?: IctAnalysisDepthStatus;
    multiTimeframeContextStatus?: IctMultiTimeframeContextStatus;
    missingTimeframes?: IctAnalysisTimeframe[];
    htfBiasSource?: IctAnalysisTimeframe[];
    sessionModelSourceTimeframe?: IctAnalysisTimeframe;
    confirmationSourceTimeframe?: IctAnalysisTimeframe;
    weeklyBiasStatus?: IctWeeklyBiasStatus;
    weeklyBiasDirection?: IctWeeklyBiasDirection;
    weeklyBiasReason?: string;
    htfAlignment?: IctHtfAlignmentBreakdown;
  };
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
