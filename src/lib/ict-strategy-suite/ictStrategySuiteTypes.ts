import type { Candle, FuturesSymbol, Timeframe } from "../types";
import type { MacroRiskFlag } from "../marketContext/marketContextTypes";

export type BiasDirection = "bullish" | "bearish" | "neutral";
export type TradeSide = "long" | "short" | "flat";
export type PdLocation = "premium" | "discount" | "equilibrium";
export type ResearchDecision = "research_only" | "no_trade";

export type LiquidityType =
  | "previous_day_high"
  | "previous_day_low"
  | "previous_week_high"
  | "previous_week_low"
  | "previous_month_high"
  | "previous_month_low"
  | "equal_highs"
  | "equal_lows"
  | "old_swing_high"
  | "old_swing_low"
  | "session_high"
  | "session_low"
  | "central_bank_dealers_range_high"
  | "central_bank_dealers_range_low"
  | "new_week_opening_gap"
  | "new_day_opening_gap";

export type PdArrayType =
  | "fair_value_gap"
  | "liquidity_void"
  | "order_block"
  | "reclaimed_order_block"
  | "mitigation_block"
  | "rejection_block"
  | "breaker_block"
  | "propulsion_block"
  | "vacuum_block";

export type IctSuiteTimeframe = "monthly" | "weekly" | "daily" | "h4" | "h1" | "m15" | "m5";

export type IctStrategyId =
  | "ict-htf-bias"
  | "ict-daily-range"
  | "ict-liquidity-run"
  | "ict-fvg-displacement"
  | "ict-order-block"
  | "ict-bread-and-butter-buy"
  | "ict-bread-and-butter-sell"
  | "ict-one-shot-one-kill"
  | "ict-index-futures-rs"
  | "ict-risk-governor";

export type IctStrategySetup =
  | "htf_bias_only"
  | "daily_range_projection"
  | "sellside_sweep_bullish_displacement"
  | "buyside_sweep_bearish_displacement"
  | "fvg_retracement"
  | "order_block_retracement"
  | "bread_and_butter_buy"
  | "bread_and_butter_sell"
  | "one_shot_one_kill"
  | "index_relative_strength"
  | "no_trade";

export interface IctTimeframeBias {
  monthly?: BiasDirection;
  weekly?: BiasDirection;
  daily?: BiasDirection;
  h4?: BiasDirection;
  h1?: BiasDirection;
  m15?: BiasDirection;
  m5?: BiasDirection;
}
export interface IctDealingRange {
  high: number;
  low: number;
  midpoint: number;
  currentLocation: PdLocation;
  sourceTimeframe: IctSuiteTimeframe;
}

export interface IctLiquidityPool {
  type: LiquidityType;
  price: number;
  timeframe: IctSuiteTimeframe;
  swept: boolean;
  distanceFromCurrent: number;
}

export interface IctPdArray {
  type: PdArrayType;
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  midpoint?: number;
  createdAt: string;
  timeframe: Exclude<IctSuiteTimeframe, "monthly" | "weekly">;
  mitigated: boolean;
}

export interface IctDisplacement {
  direction: "bullish" | "bearish";
  candleTime: string;
  impulseHigh: number;
  impulseLow: number;
  bodySize: number;
  atrMultiple?: number;
  createdFvg: boolean;
}

export interface IctStrategySignal {
  strategyId: IctStrategyId;
  symbol: string;
  side: TradeSide;
  decision: ResearchDecision;
  confidence: number;
  timeframeBias: IctTimeframeBias;
  dealingRange?: IctDealingRange;
  liquiditySwept?: IctLiquidityPool;
  drawOnLiquidity?: IctLiquidityPool;
  pdArray?: IctPdArray;
  displacement?: IctDisplacement;
  entryZone?: {
    type: PdArrayType;
    high: number;
    low: number;
    midpoint?: number;
  };
  invalidation?: number;
  target?: number;
  rrEstimate?: number;
  setup: IctStrategySetup;
  noTradeReasons: string[];
  riskNotes: string[];
  provenance: {
    methodology: "ICT";
    sourceSet: "ICT Mentorship Core Content";
    generatedAt: string;
    researchOnly: true;
  };
}

export interface IctNewsRiskEvent {
  eventId: string;
  impact: "low" | "medium" | "high" | "unknown";
  scheduledAt: string;
  reason: string;
}

export interface IctStrategySuiteMarketSnapshot {
  snapshotId?: string;
  symbol: FuturesSymbol | string;
  brokerSymbol?: string;
  provider?: string;
  timeframe?: Timeframe | string;
  sourceFingerprint?: string;
  candles: Candle[];
  higherTimeframeCandles?: Partial<Record<IctSuiteTimeframe, Candle[]>>;
  relatedMarkets?: Partial<Record<"NQ" | "NASDAQ" | "ES" | "SPX" | "YM" | "US30" | "DXY" | "VIX" | "rates" | "bonds" | "gold", Candle[]>>;
  newsEvents?: IctNewsRiskEvent[];
  macroRiskFlags?: MacroRiskFlag[];
  generatedAt?: string;
}

export interface IctRiskGovernorConfig {
  minRewardRisk: number;
  minConfidence: number;
  maxSignalsPerDay: number;
  maxRiskPerIdeaR: number;
  blockHighImpactNews: boolean;
  validSessions: Array<"Asia" | "London" | "New York" | "Off hours">;
}

export interface IctDailyRangeProjection {
  dailyProfile:
    | "bullish_expansion_day"
    | "bearish_expansion_day"
    | "consolidation_day"
    | "reversal_day"
    | "seek_and_destroy_day"
    | "low_probability_day";
  projectedHigh?: number;
  projectedLow?: number;
  likelyDraw?: IctLiquidityPool;
  invalidation?: number;
  sessionWindow?: string;
  noTradeReasons: string[];
}

export interface IctStrategySuiteEvaluation {
  evaluationId: string;
  packageName: "ict-strategy-suite";
  version: "ict_strategy_suite_v1";
  symbol: string;
  provider?: string;
  sourceFingerprint?: string;
  candleCount: number;
  signals: IctStrategySignal[];
  riskDecision: IctStrategySignal;
  journalEvents: IctStrategyJournalEvent[];
  generatedAt: string;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}

export interface IctStrategyJournalEvent {
  journalEventId: string;
  strategyId: IctStrategyId;
  symbol: string;
  timestamp: string;
  timeframeBias: IctTimeframeBias;
  dailyProfile?: IctDailyRangeProjection["dailyProfile"];
  dealingRange?: IctDealingRange;
  premiumDiscountLocation?: PdLocation;
  liquiditySwept?: IctLiquidityPool;
  drawOnLiquidity?: IctLiquidityPool;
  displacement?: IctDisplacement;
  pdArray?: IctPdArray;
  entryZone?: IctStrategySignal["entryZone"];
  invalidation?: number;
  target?: number;
  rrEstimate?: number;
  confidence: number;
  decision: ResearchDecision;
  noTradeReasons: string[];
  riskNotes: string[];
  sourceSet: "ICT Mentorship Core Content";
  researchOnly: true;
  marketSnapshotId?: string;
  sentimentSnapshotId?: string;
  decisionVersion: "ict_strategy_suite_v1";
}
