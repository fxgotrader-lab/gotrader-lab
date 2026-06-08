import type { IctSide } from "./ictAdvisorTypes";
import type { IctOpportunityLaneRecommendation } from "./ictOpportunityDetectionTypes";

export type IctRecognitionTier =
  | "full_model"
  | "forming_model"
  | "pd_array_setup"
  | "scalp_setup"
  | "unknown_structured_opportunity"
  | "market_map_only"
  | "insufficient_data";

export type IctScalpSetupStatus =
  | "scalp_candidate"
  | "scalp_watchlist"
  | "scalp_rejected"
  | "no_scalp_setup"
  | "insufficient_data";

export type IctPdArrayType =
  | "fair_value_gap"
  | "order_block"
  | "breaker_block"
  | "mitigation_block"
  | "rejection_block"
  | "propulsion_block"
  | "liquidity_void"
  | "premium_discount_array"
  | "session_high_low"
  | "prior_day_level"
  | "prior_week_level"
  | "unknown";

export type IctPdArrayDirection = "bullish" | "bearish" | "neutral";
export type IctPdArrayRole = "target" | "support" | "resistance" | "entry_context" | "invalidation" | "draw";
export type IctScalpDirection = "bullish" | "bearish" | "neutral";

export interface IctPdArrayRecognition {
  type: IctPdArrayType;
  timeframe: string;
  direction: IctPdArrayDirection;
  role: IctPdArrayRole;
  high?: number;
  low?: number;
  midpoint?: number;
  confidence: number;
  reason: string;
}

export interface IctScalpOpportunity {
  researchOnly: true;
  status: IctScalpSetupStatus;
  direction: IctScalpDirection;
  side: IctSide;
  sourceTimeframe: string;
  liquidityDraw?: {
    side: "buy_side" | "sell_side";
    level?: number;
    reason: string;
  };
  entryContext?: IctPdArrayRecognition;
  target?: number;
  invalidation?: number;
  rrEstimate?: number;
  confidence?: number;
  confirmationNeeded: string[];
  blockers: string[];
  nextAction: string;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}

export interface IctUniversalRecognitionResult {
  researchOnly: true;
  generatedAt: string;
  tier: IctRecognitionTier;
  knownModel?: {
    detected: boolean;
    modelName?: string;
    state?: string;
    direction?: IctScalpDirection;
    confidence?: number;
    reasons: string[];
  };
  pdArrays: IctPdArrayRecognition[];
  scalpOpportunity?: IctScalpOpportunity;
  marketCycleStage?: string;
  liquiditySummary?: string;
  opportunitySummary: string;
  laneRecommendation: IctOpportunityLaneRecommendation;
  nextAction: string;
  missingEvidence: string[];
  blockers: string[];
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}
