import type { IctAdvisorPacket, IctAdvisorSignal, IctSide } from "./ictAdvisorTypes";
import type { IctApprovedCandidateStatus } from "./ictApprovedSetupProfileTypes";
import type {
  IctSessionNarrative,
  IctSessionNarrativeEvent,
  IctSessionNarrativeProfile
} from "./ictSessionNarrativeTypes";

export type IctOpportunityType =
  | "liquidity_raid"
  | "session_reversal"
  | "session_continuation"
  | "retracement_to_pd_array"
  | "expansion_from_consolidation"
  | "fvg_draw"
  | "mitigation_reaction"
  | "breaker_retest"
  | "range_liquidity_sweep"
  | "unknown_structured_opportunity"
  | "none";

export type IctOpportunityStage =
  | "forming"
  | "triggered"
  | "confirmed"
  | "failed"
  | "completed"
  | "insufficient_data";

export type IctOpportunityQuality =
  | "high"
  | "medium"
  | "low"
  | "untradable"
  | "unknown";

export type IctOpportunityModelFamily =
  | "ICT"
  | "Grinch"
  | "generic_session"
  | "unknown";

export type IctOpportunityDirection = "bullish" | "bearish" | "neutral";

export type IctMarketCycleStage =
  | "consolidation"
  | "retracement"
  | "reversal"
  | "expansion"
  | "seek_and_destroy"
  | "unknown";

export type IctOpportunityLaneRecommendation =
  | "approved_candidate"
  | "paper_watchlist_candidate"
  | "watchlist_candidate"
  | "rejected_candidate"
  | "no_trade";

export interface IctOpportunityLiquidityObjective {
  side: "buy_side" | "sell_side";
  target?: number;
  source: string;
  reason: string;
}

export interface IctOpportunityPdArrayContext {
  type: string;
  role: "target" | "support" | "resistance" | "entry_context" | "invalidation";
  high?: number;
  low?: number;
  reason: string;
}

export interface IctOpportunityTradeIdea {
  side: IctSide;
  entryReference?: number;
  target?: number;
  invalidation?: number;
  rrEstimate?: number;
  confidence?: number;
}

export interface IctDetectedOpportunity {
  researchOnly: true;
  opportunityId: string;
  generatedAt: string;

  type: IctOpportunityType;
  stage: IctOpportunityStage;
  quality: IctOpportunityQuality;

  modelName?: string;
  modelFamily?: IctOpportunityModelFamily;

  direction: IctOpportunityDirection;
  marketCycleStage: IctMarketCycleStage;

  liquidityObjective?: IctOpportunityLiquidityObjective;
  pdArrayContext?: IctOpportunityPdArrayContext[];

  tradeIdea?: IctOpportunityTradeIdea;

  confirmationNeeded: string[];
  missingEvidence: string[];
  blockers: string[];

  laneRecommendation: IctOpportunityLaneRecommendation;
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
}

export interface IctOpportunityDetectionContext {
  packet?: IctAdvisorPacket;
  sessionNarrative?: IctSessionNarrative;
  recommendedSignal?: IctAdvisorSignal;
  approvedStatus?: IctApprovedCandidateStatus;
  generatedAt?: string;
  sourceFingerprint?: string;
}

export interface IctOpportunityClassificationInput {
  sessionNarrative?: IctSessionNarrative;
  sessionProfile?: IctSessionNarrativeProfile;
  events?: IctSessionNarrativeEvent[];
  recommendedSignal?: IctAdvisorSignal;
}
