import type { Candle } from "@/lib/types";
import type { IctTradeConstructionResult } from "./ictTradeConstructionTypes";

export type IctIfvgSide = "long" | "short" | "flat";
export type IctIfvgOriginalDirection = "bullish" | "bearish";
export type IctIfvgHtfAlignment = "aligned" | "against_htf" | "mixed" | "unavailable";
export type IctIfvgStatus =
  | "no_trade"
  | "candidate"
  | "replay_required"
  | "blocked_not_inverted"
  | "blocked_reused_ifvg"
  | "blocked_against_htf"
  | "blocked_low_volume"
  | "blocked_no_retest"
  | "blocked_rr"
  | "blocked_mock_source"
  | "needs_more_data";

export interface IctIfvgAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface IctIfvgInput {
  candles: Candle[];
  contextCandles?: {
    "15m"?: Candle[];
    "1h"?: Candle[];
    "4h"?: Candle[];
    "1d"?: Candle[];
  };
  sourceProvider?: string;
  sourceFingerprint?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: "5m" | "15m" | string;
  generatedAt?: string;
}

export interface IctIfvgCandleReference {
  timestamp: string;
  candleIndex: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IctIfvgBounds {
  low: number;
  high: number;
  midpoint: number;
}

export interface IctIfvgLiquidityTarget {
  type: "buy_side_liquidity" | "sell_side_liquidity";
  price: number;
  source: "prior_swing" | "recent_extreme";
}

export interface IctIfvgSessionContext {
  id: "london_open" | "new_york_open" | "rth" | "outside_rth";
  label: string;
  localTime: string;
  timingZone: "America/New_York";
  preferredWindow: boolean;
}

export interface IctIfvgCandidate {
  strategyId: "ifvg_v1";
  generatedAt: string;
  status: IctIfvgStatus;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  timeframe: "5m" | "15m" | string;
  contextTimeframes: string[];
  latestCandleTimestamp?: string;
  side: IctIfvgSide;
  originalFvgDirection?: IctIfvgOriginalDirection;
  ifvgBounds?: IctIfvgBounds;
  originalFvgCandle?: IctIfvgCandleReference;
  inversionCandle?: IctIfvgCandleReference;
  retestCandle?: IctIfvgCandleReference;
  sessionContext?: IctIfvgSessionContext;
  entry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  tradeConstruction?: IctTradeConstructionResult;
  htfAlignment: IctIfvgHtfAlignment;
  htfDirections: string[];
  liquidityTarget?: IctIfvgLiquidityTarget;
  blockers: string[];
  warnings: string[];
  presentConditions: string[];
  missingConditions: string[];
  canCreateValidationChainEntry: boolean;
  validationChainSeed?: {
    recognitionType: "full_model";
    setupLabel: "ifvg_v1";
    candidateFamily: "ifvg";
    requiredValidation: string;
  };
  compactSummary: string;
  researchOnly: true;
  authority: IctIfvgAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}
