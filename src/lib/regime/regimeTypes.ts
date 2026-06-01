import type { MarketContext } from "@/lib/marketData";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

export type CompositeRegimeLabel =
  | "trend_bull"
  | "trend_bear"
  | "range_low_vol"
  | "range_high_vol"
  | "event_high_vol"
  | "risk_off_crisis"
  | "insufficient_data";

export type RegimeDataQuality = "sufficient" | "limited" | "insufficient";

export interface RegimeScores {
  trend_strength: number;
  chop: number;
  volatility: number;
  risk_off: number;
  momentum: number;
  mean_reversion: number;
}

export interface RegimeTransitionState {
  previousStableLabel?: CompositeRegimeLabel;
  observedPersistence: number;
  requiredPersistence: number;
  hysteresisApplied: boolean;
  reason: string;
}

export interface RegimeClassification {
  regimeId: string;
  label: CompositeRegimeLabel;
  instantaneousLabel: CompositeRegimeLabel;
  stableLabel: CompositeRegimeLabel;
  transitionPending: boolean;
  confidence: number;
  dataQuality: RegimeDataQuality;
  supportingFactors: string[];
  conflictScore: number;
  scores: RegimeScores;
  transitionState: RegimeTransitionState;
  recommendedBehavior: string;
  missingInputs: string[];
  warnings: string[];
  symbol?: FuturesSymbol | string;
  timeframe?: Timeframe | string;
  candleCount: number;
  timestamp: string;
  sourceFingerprint: string;
}

export interface RegimeClassifierInput {
  candles?: Candle[];
  symbol?: FuturesSymbol | string;
  timeframe?: Timeframe | string;
  marketContext?: MarketContext;
  history?: RegimeClassification[];
  timestamp?: string;
}

export interface RegimeHistoryRecord {
  recordId: string;
  timestamp: string;
  source: "gotrader_composite_regime_classifier";
  classification: RegimeClassification;
  safetyNotice: "Research-only regime classification. No broker execution, order placement, or readiness override.";
}

