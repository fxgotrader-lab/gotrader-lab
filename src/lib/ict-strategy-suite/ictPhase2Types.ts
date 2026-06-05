import type {
  IctAdvisorDealingRange,
  IctAdvisorDisplacement,
  IctAdvisorFairValueGap,
  IctAdvisorLiquidityPool
} from "./ictAdvisorTypes";
import type { IctApprovedSetupDecision } from "./ictApprovedSetupProfileTypes";

export type IctOrderBlockVariant =
  | "standard_order_block"
  | "reclaimed_order_block"
  | "mitigation_block"
  | "rejection_block"
  | "breaker_block"
  | "propulsion_block"
  | "vacuum_block";

export type IctPhase2StrategyId =
  | "ict-order-block-taxonomy"
  | "ict-bread-and-butter-buy"
  | "ict-bread-and-butter-sell"
  | "ict-one-shot-one-kill";

export type IctPhase2Setup =
  | "order_block_retracement"
  | "breaker_retest"
  | "mitigation_block_retracement"
  | "bread_and_butter_buy"
  | "bread_and_butter_sell"
  | "one_shot_one_kill"
  | "no_trade";

export interface IctOrderBlockClassification {
  variant: IctOrderBlockVariant;
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  midpoint: number;
  createdAt: string;
  timeframe: string;
  mitigated: boolean;
  invalidated: boolean;
  displacementConfirmed: boolean;
  liquiditySweepConfirmed: boolean;
  premiumDiscountLocation?: "premium" | "discount" | "equilibrium";
  confidence: number;
  reason: string;
}

export interface IctPhase2Signal {
  strategyId: IctPhase2StrategyId;
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  side: "long" | "short" | "flat";
  decision: "research_only" | "no_trade";
  confidence: number;
  setup: IctPhase2Setup;
  orderBlock?: IctOrderBlockClassification;
  liquiditySwept?: IctAdvisorLiquidityPool;
  drawOnLiquidity?: IctAdvisorLiquidityPool;
  displacement?: IctAdvisorDisplacement;
  fairValueGap?: IctAdvisorFairValueGap;
  dealingRange?: IctAdvisorDealingRange;
  entryZone?: {
    type: IctOrderBlockVariant | "fair_value_gap";
    high: number;
    low: number;
    midpoint: number;
  };
  invalidation?: number;
  target?: number;
  rrEstimate?: number;
  noTradeReasons: string[];
  riskNotes: string[];
  approvedProfileDecision?: IctApprovedSetupDecision;
  researchOnly: true;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  provenance: {
    methodology: "ICT";
    phase: "phase_2";
    sourceSet: "ICT Mentorship Core Content";
    researchOnly: true;
    generatedAt: string;
  };
}
