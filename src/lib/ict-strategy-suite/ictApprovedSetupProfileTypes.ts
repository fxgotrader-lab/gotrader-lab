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
  | "watchlist_candidate"
  | "rejected_candidate"
  | "no_trade";

export type IctApprovedProfileId =
  | "gotrader_ict_phase1_strict"
  | "gotrader_ict_phase1_balanced"
  | "gotrader_ict_phase1_experimental"
  | "gotrader_ict_90d_session_calibrated";

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
