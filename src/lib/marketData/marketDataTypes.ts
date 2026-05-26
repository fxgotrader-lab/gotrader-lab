import type { Candle, FuturesSymbol, MarketBias, Timeframe } from "@/lib/types";

export type MarketDataMode = "mock" | "planning_only" | "future_provider";

export type MarketDataModuleStatus = "available_mock" | "missing" | "planned" | "later_advanced";

export type MarketDataProviderStatus = "planned" | "mock_only" | "disabled";

export interface OHLCVSeries {
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  candles: Candle[];
  source: "mock" | "csv_import" | "future_provider";
  updatedAt: string;
}

export interface MarketLevel {
  label: string;
  value: number;
  source: "mock" | "calculated" | "manual_import" | "future_provider";
  timeframe?: Timeframe | "day" | "week" | "month" | "overnight" | "globex";
}

export interface VolumeProfileContext {
  vwap?: number;
  anchoredVwap?: number;
  vpoc?: number;
  vah?: number;
  val?: number;
  volumeProfileStatus: MarketDataModuleStatus;
  notes: string[];
}

export interface PriceVolumeContext {
  ohlcv: OHLCVSeries;
  tickDataStatus: MarketDataModuleStatus;
  volumeProfile: VolumeProfileContext;
  priorDay: {
    high?: number;
    low?: number;
    close?: number;
  };
  priorWeek: {
    high?: number;
    low?: number;
    close?: number;
  };
  priorMonth: {
    high?: number;
    low?: number;
    close?: number;
  };
  overnight: {
    high?: number;
    low?: number;
  };
  globexRange: {
    high?: number;
    low?: number;
  };
  levels: MarketLevel[];
}

export interface OrderFlowContext {
  domStatus: MarketDataModuleStatus;
  footprintStatus: MarketDataModuleStatus;
  delta?: number;
  cumulativeDelta?: number;
  largePrints: Array<{
    price: number;
    size: number;
    side: "bid" | "ask" | "unknown";
    timestamp: string;
  }>;
  notes: string[];
}

export interface PositioningContext {
  cot?: {
    commercialNet?: number;
    nonCommercialNet?: number;
    reportDate?: string;
  };
  putCallRatio?: number;
  gammaLevels: Array<{
    label: string;
    price: number;
    strength: "low" | "medium" | "high";
  }>;
  dealerGammaFlip?: number;
  netPositioningBias: MarketBias;
  status: MarketDataModuleStatus;
}

export interface MacroEvent {
  id: string;
  name: "FOMC" | "CPI" | "NFP" | "PPI" | "retail sales" | "other";
  scheduledAt: string;
  impact: "low" | "medium" | "high";
  status: "planned" | "mock" | "manual";
}

export interface MacroEconomicContext {
  economicCalendar: MacroEvent[];
  fedFundsImpliedPath?: string;
  dxy?: number;
  vix?: number;
  twoYearYield?: number;
  tenYearYield?: number;
  macroRiskBias: MarketBias;
  status: MarketDataModuleStatus;
}

export interface IntermarketContext {
  esNqRatio?: number;
  ymEsDivergence?: "confirming" | "diverging" | "unknown";
  bondFuturesContext?: string;
  crudeGoldRiskContext?: string;
  dxyNqRelationship?: "supportive" | "headwind" | "neutral" | "unknown";
  vixEquityRelationship?: "supportive" | "risk_off" | "neutral" | "unknown";
  status: MarketDataModuleStatus;
}

export interface MarketContextModule {
  id: string;
  name: string;
  status: MarketDataModuleStatus;
  summary: string;
}

export interface PlannedMarketDataAgent {
  agentId: string;
  name: string;
  purpose: string;
  inputData: string[];
  output: string;
  whyItMatters: string;
  status: "planned";
  executionAuthority: "none";
}

export interface MarketDataProviderRoadmapEntry {
  category: string;
  futureProviders: string[];
  firstSafeStep: string;
  status: MarketDataProviderStatus;
  notes: string;
}

export interface MarketContext {
  contextId: string;
  timestamp: string;
  mode: MarketDataMode;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  priceVolume: PriceVolumeContext;
  orderFlow: OrderFlowContext;
  positioning: PositioningContext;
  macro: MacroEconomicContext;
  intermarket: IntermarketContext;
  availableModules: MarketContextModule[];
  missingModules: MarketContextModule[];
  plannedAgents: PlannedMarketDataAgent[];
  providerRoadmap: MarketDataProviderRoadmapEntry[];
  safetyNotice: "Market data adapters are research inputs only. No broker execution or live trading.";
}

export interface MarketDataAdapter<TContext> {
  adapterId: string;
  label: string;
  mode: MarketDataMode;
  status: MarketDataProviderStatus;
  requiredSecrets: string[];
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  loadContext(input: { symbol: FuturesSymbol; timeframe: Timeframe }): Promise<TContext> | TContext;
}
