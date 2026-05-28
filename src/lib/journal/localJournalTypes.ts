import type { JournalEvent, RiskDecision } from "@/lib/agentBridge";

export type LocalJournalRecordType =
  | "rejected"
  | "no_trade"
  | "data_quality_failure"
  | "macro_risk_block"
  | "research_only";

export type LocalJournalStorageMode = "local_jsonl";

export interface LocalJournalRecordProvenance {
  decisionVersion: string;
  strategyVersion: string;
  marketSnapshotId: string;
  sentimentSnapshotId?: string;
  riskPolicyVersion: string;
  signalId: string;
  riskDecisionId: string;
  agentChain: string[];
  approved: false;
  executionAllowed: false;
}

export interface LocalJournalRecord {
  localJournalRecordId: string;
  journalEntryId: string;
  recordType: LocalJournalRecordType;
  event: JournalEvent;
  provenance: LocalJournalRecordProvenance;
  createdAt: string;
  schemaVersion: string;
  storageMode: LocalJournalStorageMode;
  rawProviderPayloadIncluded: false;
}

export interface CreateLocalJournalRecordOptions {
  localJournalRecordId?: string;
  recordType?: LocalJournalRecordType;
  riskDecision?: RiskDecision;
  createdAt?: string;
}

export interface LocalJournalSummary {
  date: string;
  totalRecords: number;
  byRecordType: Record<LocalJournalRecordType, number>;
  latestRecordAt?: string;
  storageMode: LocalJournalStorageMode;
}

export interface LocalJournalSanitizationResult {
  ok: boolean;
  record?: LocalJournalRecord;
  errors: string[];
}

export interface LocalJournalReadOptions {
  date?: string;
  limit?: number;
}
