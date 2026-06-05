import type { Candle } from "../types";
import type { IctSide } from "./ictAdvisorTypes";
import type { IctApprovedSetupDecision } from "./ictApprovedSetupProfileTypes";

export type IctIndexSymbolGroup = "us_index_futures";

export type IctIndexRole =
  | "tech_leader"
  | "broad_market"
  | "industrial_leader";

export type IctSmtDivergenceType =
  | "bullish_smt"
  | "bearish_smt"
  | "no_smt"
  | "insufficient_data";

export type IctRelativeStrengthState =
  | "strongest"
  | "weakest"
  | "neutral"
  | "mixed"
  | "insufficient_data";

export interface IctIndexInstrumentContext {
  requestedSymbol: string;
  brokerSymbol: string;
  displayLabel: string;
  role: IctIndexRole;
  primaryTimeframe: string;
  htfTimeframes: string[];
  latestClose?: number;
  recentHigh?: number;
  recentLow?: number;
  previousHigh?: number;
  previousLow?: number;
  sweptBuySide: boolean;
  sweptSellSide: boolean;
  displacementDirection?: "bullish" | "bearish";
  relativeChangePct?: number;
  dataStatus: "available" | "missing" | "failed";
}

export interface IctIndexInstrumentDefinition {
  requestedSymbol: string;
  brokerSymbol: string;
  displayLabel: string;
  role: IctIndexRole;
}

export type IctIndexComparisonCandles = Partial<Record<"USTECH" | "US500" | "US30" | string, Candle[]>>;

export interface IctIndexSmtEvaluationInput {
  primarySymbol: string;
  candidateSide?: IctSide;
  primaryTimeframe: string;
  htfTimeframes?: string[];
  candlesByBrokerSymbol?: IctIndexComparisonCandles;
  instruments?: IctIndexInstrumentContext[];
  lookbackCandles?: number;
}

export interface IctSmtSignal {
  researchOnly: true;
  group: IctIndexSymbolGroup;
  primarySymbol: string;
  comparedSymbols: string[];
  divergenceType: IctSmtDivergenceType;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
  confirmsCandidate: boolean;
  rejectsCandidate: boolean;
  confidenceAdjustment: number;
  reason: string;
  notes: string[];
  instruments: IctIndexInstrumentContext[];
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
  provenance: {
    methodology: "ICT";
    model: "index_futures_smt_relative_strength";
    sourceSet: "ICT Mentorship Core Content";
    researchOnly: true;
    generatedAt: string;
  };
}

export interface IctIndexSmtJournalEvent {
  eventType: "ict_index_smt_summary";
  journalEventId: string;
  generatedAt: string;
  primarySymbol: string;
  comparedSymbols: string[];
  divergenceType: IctSmtDivergenceType;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
  confirmsCandidate: boolean;
  rejectsCandidate: boolean;
  confidenceAdjustment: number;
  reason: string;
  researchOnly: true;
  authority: IctSmtSignal["authority"];
  safety: IctSmtSignal["safety"];
}

export type IctApprovedSetupDecisionWithSmt = IctApprovedSetupDecision & {
  smtDivergenceType?: IctSmtSignal["divergenceType"];
  smtConfirmsCandidate?: boolean;
  smtRejectsCandidate?: boolean;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
  smtConfidenceAdjustment?: number;
  smtReason?: string;
};
