import type { IctResearchSignal } from "./ictSignalContractTypes";

export type IctPaperSignalStatus =
  | "eligible_for_paper_sim"
  | "not_eligible"
  | "paper_open"
  | "paper_target_hit"
  | "paper_invalidation_hit"
  | "paper_expired"
  | "paper_cancelled";

export type IctPaperSignalOutcome =
  | "target_hit"
  | "invalidation_hit"
  | "expired"
  | "cancelled"
  | "open"
  | "not_started";

export type IctPaperSignalLifecycleEventType =
  | "created"
  | "entry_simulated"
  | "target_hit"
  | "invalidation_hit"
  | "expired"
  | "cancelled";

export interface IctPaperSignalLifecycleEvent {
  at: string;
  event: IctPaperSignalLifecycleEventType;
  price?: number;
  note: string;
}

export interface IctPaperSignalEligibility {
  eligible: boolean;
  status: Extract<IctPaperSignalStatus, "eligible_for_paper_sim" | "not_eligible">;
  reasons: string[];
  warnings: string[];
}

export interface IctPaperSignalOptions {
  allowWatchlist?: boolean;
  entryType?: "entry_zone_midpoint" | "market_reference" | "manual_reference";
  entryPrice?: number;
  riskPerIdeaPct?: number;
  generatedAt?: string;
  expiresAt?: string;
}

export interface IctPaperSignalCompactPrice {
  at: string;
  price: number;
}

export interface IctPaperSignal {
  paperSignalId: string;
  sourceSignalId: string;
  generatedAt: string;
  researchOnly: true;
  paperOnly: true;
  status: IctPaperSignalStatus;
  outcome: IctPaperSignalOutcome;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  side: "long" | "short";
  simulatedEntry: {
    type: "entry_zone_midpoint" | "market_reference" | "manual_reference";
    price: number;
  };
  invalidation: number;
  target: number;
  rrEstimate: number;
  confidence?: number;
  simulatedRisk: {
    riskPerIdeaPct: number;
    maxLossR: number;
    targetR: number;
  };
  lifecycle: IctPaperSignalLifecycleEvent[];
  notes: string[];
  authority: IctResearchSignal["authority"];
  safety: {
    realOrderPlaced: false;
    brokerMutation: false;
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export type IctPaperSignalJournalEventType =
  | "ict_paper_signal_created"
  | "ict_paper_signal_updated";

export interface IctPaperSignalJournalEvent {
  eventType: IctPaperSignalJournalEventType;
  journalEventId: string;
  paperSignalId: string;
  sourceSignalId: string;
  generatedAt: string;
  status: IctPaperSignalStatus;
  outcome: IctPaperSignalOutcome;
  requestedSymbol: string;
  brokerSymbol: string;
  side: "long" | "short";
  simulatedEntryPrice: number;
  target: number;
  invalidation: number;
  rrEstimate: number;
  riskPerIdeaPct: number;
  paperOnly: true;
  researchOnly: true;
  realOrderPlaced: false;
  brokerMutation: false;
  authority: IctResearchSignal["authority"];
  safety: IctPaperSignal["safety"];
}
