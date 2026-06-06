import type { Candle } from "../types";

export type IctKillzoneName =
  | "asia"
  | "london"
  | "new_york_am"
  | "new_york_lunch"
  | "new_york_pm"
  | "off_hours";

export type IctSessionNarrativeProfile =
  | "consolidation_manipulation_distribution"
  | "accumulation_manipulation_expansion"
  | "ny_session_reversal_to_premium_fvg"
  | "ny_session_reversal_from_premium_to_discount"
  | "trend_continuation"
  | "range_bound"
  | "insufficient_data";

export type IctSessionDirectionalRead = "bullish" | "bearish" | "neutral";

export type IctDataDepthStatus = "sufficient" | "limited" | "insufficient" | "unavailable";

export interface IctSessionRange {
  session: IctKillzoneName;
  label: string;
  startTimestamp?: string;
  endTimestamp?: string;
  high?: number;
  low?: number;
  midpoint?: number;
  range?: number;
  candleCount: number;
}

export interface IctSessionNarrativeEvent {
  eventType:
    | "midnight_open"
    | "sunday_open"
    | "asia_range"
    | "london_equal_lows"
    | "london_equal_highs"
    | "london_compression"
    | "london_swept_asia_high"
    | "london_swept_asia_low"
    | "buyside_sweep"
    | "sellside_sweep"
    | "midnight_open_reclaim"
    | "midnight_open_rejection"
    | "ny_preopen_consolidation"
    | "ny_open_consolidation_low_sweep"
    | "ny_open_consolidation_high_sweep"
    | "premium_fvg_target"
    | "discount_fvg_target"
    | "ny_open_mitigation"
    | "bearish_expansion"
    | "bullish_expansion"
    | "ny_reversal_higher"
    | "ny_reversal_lower";
  timestamp?: string;
  localTime?: string;
  price?: number;
  high?: number;
  low?: number;
  direction?: IctSessionDirectionalRead;
  confidence: number;
  note: string;
}

export interface IctMitigationContext {
  detected: boolean;
  direction?: "bullish" | "bearish" | "unknown";
  sourceSession?: IctKillzoneName;
  sourceLabel?: string;
  zoneHigh?: number;
  zoneLow?: number;
  tapTimestamp?: string;
  tapLocalTime?: string;
  expansionConfirmed?: boolean;
  note: string;
}

export interface IctSessionFvgTarget {
  detected: boolean;
  direction: "premium" | "discount" | "unknown";
  high?: number;
  low?: number;
  midpoint?: number;
  sourceTimestamp?: string;
  distanceFromCurrent?: number;
  note: string;
}

export interface IctSessionNarrativeDataDepth {
  requestedLookbackDays: number;
  availableLookbackDays: number;
  status: IctDataDepthStatus;
  firstTimestamp?: string;
  lastTimestamp?: string;
  candleCount: number;
  source: "current_window" | "cached_depth" | "unavailable";
  note: string;
}

export interface IctSessionNarrative {
  researchOnly: true;
  profile: IctSessionNarrativeProfile;
  directionalRead: IctSessionDirectionalRead;
  confidence: number;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  timingZone: string;
  sourceTimestampZone: "UTC" | "unknown";
  tradingDate?: string;
  midnightOpen?: {
    timestamp?: string;
    localTime?: string;
    price?: number;
  };
  sundayOpen?: {
    timestamp?: string;
    localTime?: string;
    price?: number;
  };
  activeDealingRange?: {
    high: number;
    low: number;
    midpoint: number;
    currentLocation: "premium" | "discount" | "equilibrium";
    referencePrice: number;
  };
  ranges: IctSessionRange[];
  events: IctSessionNarrativeEvent[];
  fvgTarget?: IctSessionFvgTarget;
  mitigationContext: IctMitigationContext;
  dataDepth: IctSessionNarrativeDataDepth;
  topReasons: string[];
  noTradeReasons: string[];
  summary: string;
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

export interface IctSessionNarrativeOptions {
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  timingZone?: string;
  requestedLookbackDays?: number;
  availableLookbackDays?: number;
  depthSource?: IctSessionNarrativeDataDepth["source"];
  tradingDate?: string;
}

export type IctSessionNarrativeCandle = Pick<Candle, "timestamp" | "open" | "high" | "low" | "close" | "volume">;
