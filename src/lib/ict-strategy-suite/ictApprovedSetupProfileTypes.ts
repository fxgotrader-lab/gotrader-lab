import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import type { IctReplayResult } from "./ictReplayValidationTypes";
import type {
  IctNewsRiskLevel,
  IctRiskGovernorAction,
  IctSessionRiskState
} from "./ictNewsSessionRiskTypes";
import type {
  IctDataDepthStatus,
  IctSessionDirectionalRead,
  IctSessionNarrativeProfile
} from "./ictSessionNarrativeTypes";

export type IctApprovedCandidateStatus =
  | "approved_research_candidate"
  | "paper_watchlist_candidate"
  | "watchlist_candidate"
  | "rejected_candidate"
  | "no_trade";

export type IctApprovedProfileId =
  | "gotrader_ict_phase1_strict"
  | "gotrader_ict_phase1_balanced"
  | "gotrader_ict_phase1_experimental"
  | "gotrader_ict_90d_session_calibrated";

export type IctHtfAlignmentStatus =
  | "aligned"
  | "partially_aligned"
  | "mixed"
  | "conflicted"
  | "missing"
  | "not_required_for_model";

export type IctHtfAlignmentTimeframe = "W1" | "D1" | "H4" | "H1" | "M15" | "M5";
export type IctHtfAlignmentDirection = IctAdvisorSignal["bias"]["primary"] | "mixed" | "missing" | "unknown";
export type IctHtfAlignmentModelAllowance = "hard_blocker" | "soft_warning" | "acceptable" | "not_required";

export interface IctHtfAlignmentBreakdown {
  W1: IctHtfAlignmentDirection;
  D1: IctHtfAlignmentDirection;
  H4: IctHtfAlignmentDirection;
  H1: IctHtfAlignmentDirection;
  M15: IctHtfAlignmentDirection;
  M5: IctHtfAlignmentDirection;
  setupDirection: "long" | "short" | "flat";
  expectedDirection: IctAdvisorSignal["bias"]["primary"];
  alignmentStatus: IctHtfAlignmentStatus;
  conflictReason: string;
  modelAllowance: IctHtfAlignmentModelAllowance;
  modelAllowanceReason: string;
}

export interface IctApprovedSetupProfile {
  id: IctApprovedProfileId;
  label: string;
  researchOnly: true;
  minConfidence: number;
  minRr: number;
  requireHtfAlignment: boolean;
  requireFvgPresent: boolean;
  requireExternalLiquidityTarget: boolean;
  rejectEquilibrium: boolean;
  rejectTargetTooClose: boolean;
  allowedSessions?: string[];
  allowedSetups?: string[];
  allowedSides?: Array<"long" | "short">;
  maxSignalsPerSymbolPerDay?: number;
  maxSignalsPerSession?: number;
  riskFilters: {
    rejectHighImpactNews: boolean;
    rejectMissingHtfContext: boolean;
    rejectMixedBias: boolean;
    rejectNoDisplacement: boolean;
    rejectNoLiquiditySweep: boolean;
  };
}

export interface IctApprovedSetupDecision {
  profileId: IctApprovedProfileId;
  status: IctApprovedCandidateStatus;
  researchOnly: true;
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  strategyId: IctAdvisorSignal["strategyId"];
  setup: IctAdvisorSignal["setup"];
  side: "long" | "short" | "flat";
  confidence: number;
  rrEstimate?: number;
  compositeBias?: string;
  htfAligned?: boolean;
  htfAlignment?: IctHtfAlignmentBreakdown;
  dealingRangeLocation?: string;
  liquidityTargetType?: string;
  fvgStatus?: string;
  smtDivergenceType?: string;
  smtConfirmsCandidate?: boolean;
  smtRejectsCandidate?: boolean;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
  smtConfidenceAdjustment?: number;
  smtReason?: string;
  newsRiskLevel?: IctNewsRiskLevel;
  sessionRiskState?: IctSessionRiskState;
  riskGovernorAction?: IctRiskGovernorAction;
  riskGovernorConfidenceAdjustment?: number;
  blockingEventsCount?: number;
  cautionEventsCount?: number;
  newsSessionRiskNotes?: string[];
  sessionNarrativeProfile?: IctSessionNarrativeProfile;
  sessionDirectionalRead?: IctSessionDirectionalRead;
  sessionNarrativeConfidence?: number;
  sessionMitigationDetected?: boolean;
  fvgTargetDetected?: boolean;
  fvgTargetDirection?: "premium" | "discount" | "unknown";
  dataDepthStatus?: IctDataDepthStatus;
  availableLookbackDays?: number;
  requestedLookbackDays?: number;
  sessionNarrativeReasons?: string[];
  approvalScore: number;
  approvedReasons: string[];
  rejectionReasons: string[];
  watchlistReasons: string[];
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
    methodology: "ICT";
    profile: IctApprovedProfileId;
    sourceSet: "ICT Mentorship Core Content";
    researchOnly: true;
    generatedAt: string;
  };
}

export interface IctApprovedSetupProfileRunSummary {
  profileId: IctApprovedProfileId;
  label: string;
  researchOnly: true;
  totalSignalsBefore: number;
  totalApproved: number;
  totalPaperWatchlist: number;
  totalWatchlist: number;
  totalRejected: number;
  totalNoTrade: number;
  signalReductionPct: number;
  approvedTargetFirstRate: number;
  approvedAverageRr: number;
  topApprovalReasons: Array<{ reason: string; count: number }>;
  topRejectionReasons: Array<{ reason: string; count: number }>;
}

export interface IctApprovedSetupProfileJournalEvent {
  eventType: "ict_approved_setup_profile_summary";
  journalEventId: string;
  runId?: string;
  generatedAt: string;
  profileId: IctApprovedProfileId;
  totalSignalsBefore: number;
  totalApproved: number;
  totalWatchlist: number;
  totalRejected: number;
  totalNoTrade: number;
  signalReductionPct: number;
  approvedTargetFirstRate: number;
  approvedAverageRr: number;
  topApprovalReasons: Array<{ reason: string; count: number }>;
  topRejectionReasons: Array<{ reason: string; count: number }>;
  researchOnly: true;
  authority: IctApprovedSetupDecision["authority"];
  safety: IctApprovedSetupDecision["safety"];
}

export type IctApprovedSetupProfileInput = IctAdvisorSignal | IctReplayResult;
