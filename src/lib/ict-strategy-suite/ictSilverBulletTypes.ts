import type { Candle } from "@/lib/types";

export type IctSilverBulletSessionId = "london_open" | "new_york_am" | "new_york_pm";
export type IctSilverBulletSide = "long" | "short" | "flat";
export type IctSilverBulletStatus = "replay_required" | "no_trade" | "needs_more_data" | "blocked";
export type IctSilverBulletFvgDirection = "bullish" | "bearish";
export type IctSilverBulletSweepType = "sell_side" | "buy_side";

export interface IctSilverBulletAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface IctSilverBulletNewsEvent {
  timestamp: string;
  impact: "high" | "medium" | "low";
  label?: string;
}

export interface IctSilverBulletInput {
  candles: Candle[];
  contextCandles?: {
    "5m"?: Candle[];
    "15m"?: Candle[];
  };
  sourceProvider?: string;
  sourceFingerprint?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  newsEvents?: IctSilverBulletNewsEvent[];
  vwap?: number;
  vwapExtensionThreshold?: number;
  generatedAt?: string;
}

export interface IctSilverBulletSessionWindow {
  id: IctSilverBulletSessionId;
  label: string;
  startLocal: string;
  endLocal: string;
  timingZone: "America/New_York";
}

export interface IctSilverBulletSweep {
  type: IctSilverBulletSweepType;
  sweptLevel: number;
  candleTimestamp: string;
  candleIndex: number;
}

export interface IctSilverBulletFvg {
  direction: IctSilverBulletFvgDirection;
  low: number;
  high: number;
  midpoint: number;
  candleOpen: number;
  createdAt: string;
  candleIndex: number;
}

export interface IctSilverBulletCandidate {
  strategyId: "silver_bullet_v1";
  generatedAt: string;
  status: IctSilverBulletStatus;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  timeframe: string;
  contextTimeframes: string[];
  sessionWindow?: IctSilverBulletSessionWindow;
  latestCandleTimestamp?: string;
  side: IctSilverBulletSide;
  sweep?: IctSilverBulletSweep;
  fvg?: IctSilverBulletFvg;
  returnToFvgTimestamp?: string;
  entry?: number;
  alternateEntry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  blockers: string[];
  warnings: string[];
  presentConditions: string[];
  missingConditions: string[];
  canCreateValidationChainEntry: boolean;
  validationChainSeed?: {
    recognitionType: "full_model";
    setupLabel: "silver_bullet_v1";
    candidateFamily: "silver_bullet";
    requiredValidation: string;
  };
  compactSummary: string;
  researchOnly: true;
  authority: IctSilverBulletAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}
