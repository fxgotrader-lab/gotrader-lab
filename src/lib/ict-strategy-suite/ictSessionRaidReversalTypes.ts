import type { IctTradeConstructionBlocker } from "./ictTradeConstructionTypes";

export type IctSessionRaidReversalNarrativeId = "nasdaq_london_raid_ny_reversal_v1";
export type IctSessionRaidReversalStrategyId = "session_raid_reversal_v1";

export type IctSessionRaidReversalStatus =
  | "complete_bearish_reversal_candidate"
  | "forming"
  | "near_miss"
  | "rejected"
  | "needs_more_data"
  | "context_only";

export type IctSessionRaidReversalSide = "short" | "neutral" | "scenario";

export type IctSessionRaidReversalStepName =
  | "asia_consolidation"
  | "london_expansion"
  | "asia_high_sweep"
  | "prior_day_high_sweep"
  | "london_high_created"
  | "ny_london_high_raid"
  | "bearish_mss"
  | "breaker_detected"
  | "fvg_detected"
  | "fvg_retrace"
  | "sell_side_delivery";

export type IctSessionRaidReversalPremiumDiscount = "premium" | "discount" | "equilibrium" | "unknown";

export interface IctSessionRaidReversalAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface IctSessionRaidReversalSafety {
  rawCandlesExcluded: true;
  rawSnapshotsExcluded: true;
  accountDataExcluded: true;
  orderDataExcluded: true;
  positionDataExcluded: true;
  secretsExcluded: true;
}

export interface IctSessionRaidReversalLevel {
  label: string;
  price?: number;
  timestamp?: string;
  localTime?: string;
  source: string;
}

export interface IctSessionRaidReversalRange {
  high?: number;
  low?: number;
  midpoint?: number;
  startTimestamp?: string;
  endTimestamp?: string;
  candleCount: number;
}

export interface IctSessionRaidReversalZone {
  high?: number;
  low?: number;
  midpoint?: number;
  createdAt?: string;
  source: string;
}

export interface IctSessionRaidReversalReferenceLevels {
  sundayOpen?: IctSessionRaidReversalLevel;
  midnightOpen?: IctSessionRaidReversalLevel;
  asiaRange: IctSessionRaidReversalRange;
  londonRange: IctSessionRaidReversalRange;
  nyRange: IctSessionRaidReversalRange;
  priorDayHigh?: IctSessionRaidReversalLevel;
  priorDayLow?: IctSessionRaidReversalLevel;
  londonHigh?: IctSessionRaidReversalLevel;
  londonLow?: IctSessionRaidReversalLevel;
  nySessionHigh?: IctSessionRaidReversalLevel;
  nySessionLow?: IctSessionRaidReversalLevel;
  currentPremiumDiscount: IctSessionRaidReversalPremiumDiscount;
  sellSideLiquidityTargets: IctSessionRaidReversalLevel[];
  buySideLiquidityTargets: IctSessionRaidReversalLevel[];
}

export interface IctSessionRaidReversalStep {
  step: IctSessionRaidReversalStepName;
  detected: boolean;
  timestamp?: string;
  localTime?: string;
  price?: number;
  high?: number;
  low?: number;
  note: string;
  confidence: number;
}

export interface IctSessionRaidReversalValidationSeed {
  strategyId: IctSessionRaidReversalNarrativeId;
  setupLabel: string;
  side: "short";
  entry?: number;
  invalidation?: number;
  target?: number;
  rr?: number;
  sourceFingerprint?: string;
}

export interface IctSessionRaidReversalNarrative {
  narrativeId: IctSessionRaidReversalNarrativeId;
  strategyId: IctSessionRaidReversalStrategyId;
  status: IctSessionRaidReversalStatus;
  side: IctSessionRaidReversalSide;
  requestedSymbol: string;
  brokerSymbol: string;
  sourceProvider: string;
  sourceFingerprint?: string;
  primaryTimeframe: string;
  entryTimeframe: string;
  htfTimeframes: string[];
  timingZone: string;
  tradingDate?: string;
  referenceLevels: IctSessionRaidReversalReferenceLevels;
  steps: IctSessionRaidReversalStep[];
  breaker?: IctSessionRaidReversalZone;
  fairValueGap?: IctSessionRaidReversalZone;
  entry?: number;
  invalidation?: number;
  target?: number;
  rr?: number;
  tradeConstructionBlockers: IctTradeConstructionBlocker[];
  blockers: string[];
  missingConditions: string[];
  bullishScenario: string;
  bearishScenario: string;
  nextAction: string;
  canCreateValidationChainEntry: boolean;
  validationChainSeed?: IctSessionRaidReversalValidationSeed;
  confidence: number;
  researchOnly: true;
  authority: IctSessionRaidReversalAuthority;
  safety: IctSessionRaidReversalSafety;
}

export interface IctSessionRaidReversalInput {
  candles5m: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  candles15m?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  htfContext?: Record<string, unknown[]>;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  primaryTimeframe?: string;
  entryTimeframe?: string;
  timingZone?: string;
  generatedAt?: string;
  tradingDate?: string;
  weeklyBiasDirection?: string;
}
