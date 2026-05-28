import type { JournalEvent } from "@/lib/agentBridge";
import type { MacroRiskFlag } from "@/lib/marketContext";
import type {
  CreateLocalJournalRecordOptions,
  LocalJournalRecord,
  LocalJournalRecordType,
  LocalJournalSanitizationResult,
  LocalJournalSummary
} from "@/lib/journal/localJournalTypes";

export const LOCAL_JOURNAL_SCHEMA_VERSION = "local_journal_record_v1" as const;
export const LOCAL_JOURNAL_STORAGE_MODE = "local_jsonl" as const;
export const LOCAL_JOURNAL_MAX_MACRO_FLAGS = 5;

const secretFieldNames = new Set([
  "apikey",
  "api_key",
  "password",
  "secret",
  "privatekey",
  "private_key",
  "credential",
  "credentials",
  "authorization",
  "bearer",
  "token"
]);

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const inferLocalJournalRecordType = (event: JournalEvent): LocalJournalRecordType => {
  const reason = event.reason.toLowerCase();
  if (event.status === "failed") {
    return "data_quality_failure";
  }
  if (event.macroRiskFlags?.some((flag) => flag.severity === "block") || reason.includes("macro")) {
    return "macro_risk_block";
  }
  if (reason.includes("no trade") || reason.includes("no_trade")) {
    return "no_trade";
  }
  if (event.strategyVersion.includes("research")) {
    return "research_only";
  }
  return "rejected";
};

const compactMacroRiskFlags = (flags: MacroRiskFlag[] = []): MacroRiskFlag[] =>
  flags.slice(0, LOCAL_JOURNAL_MAX_MACRO_FLAGS).map((flag) => ({
    flagId: flag.flagId,
    severity: flag.severity,
    reason: flag.reason,
    eventId: flag.eventId,
    appliesToSymbols: flag.appliesToSymbols.slice(0, 10),
    windowStart: flag.windowStart,
    windowEnd: flag.windowEnd,
    generatedAt: flag.generatedAt
  }));

const compactJournalEvent = (event: JournalEvent): JournalEvent => ({
  journalEntryId: event.journalEntryId,
  signalId: event.signalId,
  riskDecisionId: event.riskDecisionId,
  status: event.status,
  reason: event.reason,
  timestamp: event.timestamp,
  decisionVersion: event.decisionVersion,
  strategyVersion: event.strategyVersion,
  marketSnapshotId: event.marketSnapshotId,
  sentimentSnapshotId: event.sentimentSnapshotId,
  riskPolicyVersion: event.riskPolicyVersion,
  macroRiskFlags: compactMacroRiskFlags(event.macroRiskFlags ?? []),
  agentChain: event.agentChain
});

export const createLocalJournalRecord = (
  event: JournalEvent,
  options: CreateLocalJournalRecordOptions = {}
): LocalJournalRecord => {
  const compactEvent = compactJournalEvent(event);
  return {
    localJournalRecordId: options.localJournalRecordId ?? createId("local_journal"),
    journalEntryId: compactEvent.journalEntryId,
    recordType: options.recordType ?? inferLocalJournalRecordType(compactEvent),
    event: compactEvent,
    provenance: {
      decisionVersion: compactEvent.decisionVersion,
      strategyVersion: compactEvent.strategyVersion,
      marketSnapshotId: compactEvent.marketSnapshotId,
      sentimentSnapshotId: compactEvent.sentimentSnapshotId,
      riskPolicyVersion: compactEvent.riskPolicyVersion,
      signalId: compactEvent.signalId,
      riskDecisionId: compactEvent.riskDecisionId,
      agentChain: compactEvent.agentChain,
      approved: false,
      executionAllowed: false
    },
    createdAt: options.createdAt ?? new Date().toISOString(),
    schemaVersion: LOCAL_JOURNAL_SCHEMA_VERSION,
    storageMode: LOCAL_JOURNAL_STORAGE_MODE,
    rawProviderPayloadIncluded: false
  };
};

const collectSanitizationErrors = (value: unknown, path = "record"): string[] => {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSanitizationErrors(item, `${path}[${index}]`));
  }
  const errors: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (secretFieldNames.has(normalizedKey)) {
      errors.push(`Secret-like field is not allowed at ${path}.${key}`);
    }
    if ((key === "providerPayloadIncluded" || key === "rawProviderPayloadIncluded") && child !== false) {
      errors.push(`${path}.${key} must be false`);
    }
    if (key === "executionAllowed" && child !== false) {
      errors.push(`${path}.${key} must be false`);
    }
    if (key === "approved" && child !== false) {
      errors.push(`${path}.${key} must be false`);
    }
    errors.push(...collectSanitizationErrors(child, `${path}.${key}`));
  }
  return errors;
};

export const sanitizeJournalRecord = (record: LocalJournalRecord): LocalJournalSanitizationResult => {
  const sanitizedRecord: LocalJournalRecord = {
    ...record,
    event: compactJournalEvent(record.event),
    provenance: {
      ...record.provenance,
      approved: false,
      executionAllowed: false
    },
    rawProviderPayloadIncluded: false
  };
  const errors = collectSanitizationErrors(sanitizedRecord);
  if (sanitizedRecord.rawProviderPayloadIncluded !== false) {
    errors.push("rawProviderPayloadIncluded must be false");
  }
  if (sanitizedRecord.provenance.approved !== false || sanitizedRecord.provenance.executionAllowed !== false) {
    errors.push("Local journal records cannot persist approved or executable decisions in this phase");
  }
  return {
    ok: errors.length === 0,
    record: errors.length === 0 ? sanitizedRecord : undefined,
    errors
  };
};

export const emptyLocalJournalSummary = (date: string): LocalJournalSummary => ({
  date,
  totalRecords: 0,
  byRecordType: {
    rejected: 0,
    no_trade: 0,
    data_quality_failure: 0,
    macro_risk_block: 0,
    research_only: 0
  },
  storageMode: LOCAL_JOURNAL_STORAGE_MODE
});
