import type { Candle } from "@/lib/types";

export type IctTurtleSoupSessionId = "london_open" | "new_york_open";
export type IctTurtleSoupSide = "long" | "short" | "flat";
export type IctTurtleSoupStatus =
  | "replay_required"
  | "no_trade"
  | "needs_more_data"
  | "blocked_stale_sweep"
  | "blocked_no_rejection"
  | "blocked_no_mss"
  | "blocked_middle_of_range"
  | "blocked_low_rr"
  | "blocked_news"
  | "blocked_mock_source";

export interface IctTurtleSoupAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface IctTurtleSoupNewsEvent {
  timestamp: string;
  impact: "high" | "medium" | "low";
  label?: string;
}

export interface IctTurtleSoupInput {
  setupCandles: Candle[];
  entryCandles: Candle[];
  sourceProvider?: string;
  sourceFingerprint?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  setupTimeframe?: "15m" | "1h";
  entryTimeframe?: "5m";
  newsEvents?: IctTurtleSoupNewsEvent[];
  generatedAt?: string;
}

export interface IctTurtleSoupSessionWindow {
  id: IctTurtleSoupSessionId;
  label: string;
  startLocal: string;
  endLocal: string;
  timingZone: "America/New_York";
}

export interface IctTurtleSoupSweep {
  type: "sweep_high" | "sweep_low";
  level: number;
  wick: number;
  timestamp: string;
  candleIndex: number;
}

export interface IctTurtleSoupMss {
  direction: "bullish" | "bearish";
  brokenLevel: number;
  timestamp: string;
  candleIndex: number;
}

export interface IctTurtleSoupCandidate {
  strategyId: "turtle_soup_v1";
  generatedAt: string;
  status: IctTurtleSoupStatus;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  setupTimeframe: "15m" | "1h";
  entryTimeframe: "5m";
  sessionWindow?: IctTurtleSoupSessionWindow;
  latestCandleTimestamp?: string;
  side: IctTurtleSoupSide;
  rangeHigh?: number;
  rangeLow?: number;
  sweep?: IctTurtleSoupSweep;
  rejectionTimestamp?: string;
  marketStructureShift?: IctTurtleSoupMss;
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
    setupLabel: "turtle_soup_v1";
    candidateFamily: "turtle_soup";
    requiredValidation: string;
  };
  compactSummary: string;
  researchOnly: true;
  authority: IctTurtleSoupAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}
