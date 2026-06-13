import type { Candle } from "@/lib/types";

export type IctCisdSide = "long" | "short" | "flat";
export type IctCisdDeliveryDirection = "bullish" | "bearish" | "mixed" | "unknown";
export type IctCisdStatus =
  | "no_trade"
  | "candidate"
  | "replay_required"
  | "blocked_no_prior_delivery"
  | "blocked_weak_cisd_candle"
  | "blocked_chop"
  | "blocked_no_retest"
  | "blocked_rr"
  | "blocked_news"
  | "blocked_mock_source"
  | "needs_more_data";

export interface IctCisdAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface IctCisdNewsEvent {
  timestamp: string;
  impact: "high" | "medium" | "low";
  label?: string;
}

export interface IctCisdInput {
  candles: Candle[];
  sourceProvider?: string;
  sourceFingerprint?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: "5m" | "15m" | string;
  newsEvents?: IctCisdNewsEvent[];
  generatedAt?: string;
}

export interface IctCisdCandleReference {
  timestamp: string;
  candleIndex: number;
  open: number;
  high: number;
  low: number;
  close: number;
  bodyHigh: number;
  bodyLow: number;
  bodySize: number;
  rangeSize: number;
  direction: "bullish" | "bearish" | "doji";
}

export interface IctCisdBodyZone {
  low: number;
  high: number;
  midpoint: number;
}

export interface IctCisdSessionContext {
  id: "rth_open" | "rth" | "outside_rth";
  label: string;
  timingZone: "America/New_York";
  localTime: string;
  isSessionOpenWindow: boolean;
}

export interface IctCisdCandidate {
  strategyId: "cisd_v1";
  generatedAt: string;
  status: IctCisdStatus;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  timeframe: "5m" | "15m" | string;
  latestCandleTimestamp?: string;
  side: IctCisdSide;
  priorDeliveryDirection: IctCisdDeliveryDirection;
  cisdCandle?: IctCisdCandleReference;
  retestTimestamp?: string;
  bodyZone?: IctCisdBodyZone;
  sessionContext?: IctCisdSessionContext;
  entry?: number;
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
    setupLabel: "cisd_v1";
    candidateFamily: "cisd";
    requiredValidation: string;
  };
  compactSummary: string;
  researchOnly: true;
  authority: IctCisdAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}
