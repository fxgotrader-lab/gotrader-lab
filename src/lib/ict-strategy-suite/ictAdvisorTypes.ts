import type { CanonicalCandleProvider } from "../candleSources";

export type IctBias = "bullish" | "bearish" | "neutral";
export type IctSide = "long" | "short" | "flat";
export type IctDecision = "research_only" | "no_trade";
export type IctLocation = "premium" | "discount" | "equilibrium";

export type IctLiquidityType =
  | "previous_day_high"
  | "previous_day_low"
  | "session_high"
  | "session_low"
  | "equal_highs"
  | "equal_lows"
  | "old_swing_high"
  | "old_swing_low";

export interface IctAdvisorDealingRange {
  high: number;
  low: number;
  midpoint: number;
  currentLocation: IctLocation;
  sourceTimeframe: string;
}
export interface IctAdvisorLiquidityPool {
  type: IctLiquidityType;
  price: number;
  timeframe: string;
  swept: boolean;
  distanceFromCurrent: number;
}

export interface IctAdvisorDisplacement {
  direction: "bullish" | "bearish";
  candleTime: string;
  impulseHigh: number;
  impulseLow: number;
  bodySize: number;
  createdFvg: boolean;
}

export interface IctAdvisorFairValueGap {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  midpoint: number;
  timeframe: string;
  mitigated: boolean;
  createdAt: string;
}

export interface IctAdvisorSignal {
  strategyId:
    | "ict-htf-bias"
    | "ict-daily-range"
    | "ict-liquidity-pool"
    | "ict-fvg-displacement";
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  side: IctSide;
  decision: IctDecision;
  confidence: number;
  bias: {
    primary: IctBias;
    htf: Record<string, IctBias>;
    composite: IctBias;
  };
  dealingRange?: IctAdvisorDealingRange;
  liquiditySwept?: IctAdvisorLiquidityPool;
  drawOnLiquidity?: IctAdvisorLiquidityPool;
  displacement?: IctAdvisorDisplacement;
  fairValueGap?: IctAdvisorFairValueGap;
  entryZone?: {
    type: "fair_value_gap";
    high: number;
    low: number;
    midpoint: number;
  };
  invalidation?: number;
  target?: number;
  rrEstimate?: number;
  setup:
    | "htf_bias_only"
    | "daily_range_projection"
    | "sellside_sweep_bullish_displacement"
    | "buyside_sweep_bearish_displacement"
    | "fvg_retracement"
    | "no_trade";
  summary: string;
  noTradeReasons: string[];
  riskNotes: string[];
  provenance: {
    methodology: "ICT";
    sourceSet: "ICT Mentorship Core Content";
    researchOnly: true;
    generatedAt: string;
  };
}

export interface IctAdvisorJournalEvent {
  journalEventId: string;
  strategyId: IctAdvisorSignal["strategyId"];
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  timestamp: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  compositeBias: IctBias;
  setup: IctAdvisorSignal["setup"];
  liquiditySwept?: IctAdvisorLiquidityPool;
  drawOnLiquidity?: IctAdvisorLiquidityPool;
  dealingRangeLocation?: IctLocation;
  displacementConfirmed: boolean;
  fvgDetected: boolean;
  entryZone?: IctAdvisorSignal["entryZone"];
  invalidation?: number;
  target?: number;
  rrEstimate?: number;
  confidence: number;
  decision: IctDecision;
  noTradeReasons: string[];
  riskNotes: string[];
  researchOnly: true;
}

export interface IctAdvisorPacket {
  packetId: string;
  source: "gotrader_ict_strategy_suite";
  mode: "advisory_only";
  generatedAt: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  activeSource: {
    provider: CanonicalCandleProvider;
    candleCount: number;
    firstTimestamp?: string;
    lastTimestamp?: string;
    sourceFingerprint: string;
    sourceLabel: string;
  };
  signals: IctAdvisorSignal[];
  recommendedSignal: IctAdvisorSignal;
  compactSummary: {
    compositeBias: IctBias;
    drawOnLiquidity?: string;
    setup: IctAdvisorSignal["setup"];
    decision: IctDecision;
    side: IctSide;
    confidence: number;
    noTradeReasonCount: number;
  };
  journalEvents: IctAdvisorJournalEvent[];
  journalStatus: "written" | "memory_only" | "unavailable" | "skipped";
  safetyLocks: {
    rawCandlesIncluded: false;
    rawSnapshotsIncluded: false;
    secretsIncluded: false;
    accountDataIncluded: false;
    orderDataIncluded: false;
    positionDataIncluded: false;
  };
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}
