import type { IctResearchSignal } from "./ictSignalContractTypes";

export type IctCmdPaperTrackingState =
  | "pending"
  | "active"
  | "target_hit"
  | "invalidation_hit"
  | "expired"
  | "cancelled";

export type IctCmdPaperTrackingOutcome =
  | "open"
  | "target_hit"
  | "invalidation_hit"
  | "expired"
  | "cancelled";

export interface IctCmdPaperTrackingCompactCandle {
  timestamp: string;
  high: number;
  low: number;
  close?: number;
}

export interface IctCmdPaperTrackingRecord {
  trackingId: string;
  sourceSignalId: string;
  generatedAt: string;
  lastCheckedAt?: string;
  sourceModel: "consolidation_manipulation_distribution";
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  side: "long" | "short";
  setup?: string;
  target: number;
  invalidation: number;
  rrEstimate: number;
  confidence?: number;
  state: IctCmdPaperTrackingState;
  outcome: IctCmdPaperTrackingOutcome;
  modelQualityLane: "paper_watchlist";
  approvedProfileStatus: "paper_watchlist_candidate";
  paperOnly: true;
  researchOnly: true;
  executionAllowed: false;
  lastPriceChecked?: {
    at: string;
    high: number;
    low: number;
    close?: number;
    source: "read_only_candle" | "manual_compact_candle";
  };
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

export interface IctCmdPaperTrackingEligibility {
  eligible: boolean;
  status: "eligible" | "not_eligible";
  reasons: string[];
  warnings: string[];
}

export type IctCmdPaperTrackingJournalEventType =
  | "ict_cmd_paper_tracking_created"
  | "ict_cmd_paper_tracking_updated";

export interface IctCmdPaperTrackingJournalEvent {
  eventType: IctCmdPaperTrackingJournalEventType;
  journalEventId: string;
  trackingId: string;
  sourceSignalId: string;
  generatedAt: string;
  lastCheckedAt?: string;
  state: IctCmdPaperTrackingState;
  outcome: IctCmdPaperTrackingOutcome;
  sourceModel: "consolidation_manipulation_distribution";
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  side: "long" | "short";
  setup?: string;
  target: number;
  invalidation: number;
  rrEstimate: number;
  confidence?: number;
  paperOnly: true;
  researchOnly: true;
  executionAllowed: false;
  realOrderPlaced: false;
  brokerMutation: false;
  authority: IctResearchSignal["authority"];
  safety: IctCmdPaperTrackingRecord["safety"];
}

export type IctCmdPaperTrackingCreateResult =
  | {
      ok: true;
      record: IctCmdPaperTrackingRecord;
      journalEvent: IctCmdPaperTrackingJournalEvent;
    }
  | {
      ok: false;
      reason: string;
      eligibility: IctCmdPaperTrackingEligibility;
      authority: IctResearchSignal["authority"];
      safety: IctCmdPaperTrackingRecord["safety"];
    };

export interface IctCmdPaperTrackingUpdateResult {
  record: IctCmdPaperTrackingRecord;
  journalEvent?: IctCmdPaperTrackingJournalEvent;
  checkedCandleCount: number;
  changed: boolean;
  reason: string;
}
