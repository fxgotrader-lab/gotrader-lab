import type { IctBias, IctLocation, IctSide } from "./ictAdvisorTypes";
import type { IctApprovedCandidateStatus } from "./ictApprovedSetupProfileTypes";
import type { IctModelQualityLane } from "./ictCurrentReadTypes";
import type { IctPaperSimEligibilityStatus, IctReadinessSummary } from "./ictCurrentReadTypes";
import type { IctAnalysisDepthStatus, IctAnalysisTimeframe } from "./ictMarketAnalysisContextTypes";
import type { IctMonteCarloRobustnessRating } from "./ictMonteCarloTypes";
import type {
  IctDataDepthStatus,
  IctSessionDirectionalRead,
  IctSessionModelName,
  IctSessionModelState,
  IctSessionNarrativeProfile
} from "./ictSessionNarrativeTypes";

export type IctResearchSignalStatus =
  | "approved_research_signal"
  | "watchlist_signal"
  | "rejected_signal"
  | "no_signal";

export type IctExecutionReadiness =
  | "research_only"
  | "paper_ready_later"
  | "execution_ready_later";

export interface IctResearchSignalEntryZone {
  high: number;
  low: number;
  midpoint?: number;
  type?: string;
}

export interface IctResearchSignalMonteCarlo {
  robustnessRating?: IctMonteCarloRobustnessRating;
  riskOfRuinPct?: number;
  recommendedMaxRiskPerTradePct?: number;
  usableOutcomes?: number;
}

export interface IctResearchSignal {
  signalId: string;
  generatedAt: string;
  researchOnly: true;
  status: IctResearchSignalStatus;
  executionReadiness: IctExecutionReadiness;
  executionAllowed: false;
  requestedSymbol: string;
  brokerSymbol: string;
  displayLabel?: string;
  primaryTimeframe: string;
  displayTimeframe?: string;
  displayTimeframeRole?: "chart_display_reference_only";
  analysisTimeframesRequested?: IctAnalysisTimeframe[];
  analysisTimeframesLoaded?: IctAnalysisTimeframe[];
  requiredTimeframesLoaded?: boolean;
  analysisTimeframesUsed?: IctAnalysisTimeframe[];
  analysisDepthStatus?: IctAnalysisDepthStatus;
  multiTimeframeContextStatus?: "built" | "partial" | "unavailable";
  missingTimeframes?: IctAnalysisTimeframe[];
  htfBiasSource?: IctAnalysisTimeframe[];
  sessionModelSourceTimeframe?: IctAnalysisTimeframe;
  confirmationSourceTimeframe?: IctAnalysisTimeframe;
  weeklyBiasStatus?: "loaded" | "unavailable" | "insufficient_data" | "skipped";
  weeklyBiasDirection?: "bullish" | "bearish" | "neutral" | "unknown";
  weeklyBiasReason?: string;
  htfTimeframes: string[];
  strategyId?: string;
  setup?: string;
  phase?: "phase_1" | "phase_2" | "combined";
  side: IctSide;
  entryZone?: IctResearchSignalEntryZone;
  invalidation?: number;
  target?: number;
  rrEstimate?: number;
  confidence?: number;
  approvedProfileStatus?: IctApprovedCandidateStatus;
  modelQualityLane: IctModelQualityLane;
  paperWatchlistEligible: boolean;
  paperWatchlistReason?: string;
  paperWatchlistEvidenceSummary?: string;
  paperSimEligibilityStatus?: IctPaperSimEligibilityStatus;
  paperSimEligibilityReason?: string;
  paperSimAllowed: boolean;
  paperOnly: boolean;
  readinessSummary: IctReadinessSummary;
  approvalScore?: number;
  bias?: IctBias;
  smtStatus?: string;
  newsSessionRisk?: string;
  riskGovernorAction?: string;
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
  fvgTargetDirection?: "premium" | "discount" | "unknown";
  sessionNarrativeReasons?: string[];
  dataDepthStatus?: IctDataDepthStatus;
  monteCarlo?: IctResearchSignalMonteCarlo;
  reasons: string[];
  rejectionReasons: string[];
  warnings: string[];
  nextAction: string;
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
  provenance: {
    source: "ict_current_read";
    methodology: "ICT";
    researchOnly: true;
    generatedAt: string;
  };
}

export interface IctResearchSignalJournalEvent {
  eventType: "ict_research_signal_generated";
  journalEventId: string;
  signalId: string;
  generatedAt: string;
  status: IctResearchSignalStatus;
  requestedSymbol: string;
  brokerSymbol: string;
  side: IctSide;
  setup?: string;
  rrEstimate?: number;
  confidence?: number;
  target?: number;
  invalidation?: number;
  monteCarloRobustnessRating?: IctMonteCarloRobustnessRating;
  riskOfRuinPct?: number;
  recommendedMaxRiskPerTradePct?: number;
  executionAllowed: false;
  researchOnly: true;
  authority: IctResearchSignal["authority"];
  safety: IctResearchSignal["safety"];
}

export interface IctResearchSignalCompleteness {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

export type IctSignalRiskBlockingReason =
  | "risk_governor_blocked"
  | "smt_rejects_candidate"
  | "missing_direction"
  | "missing_target"
  | "missing_invalidation"
  | "missing_rr"
  | "missing_confidence"
  | "rejected_current_read";

export type IctResearchSignalLocation = IctLocation;
