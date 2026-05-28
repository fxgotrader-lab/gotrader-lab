import fs from "node:fs";
import path from "node:path";

export const LOCAL_JOURNAL_SCHEMA_VERSION = "local_journal_record_v1";
export const LOCAL_JOURNAL_STORAGE_MODE = "local_jsonl";
export const LOCAL_JOURNAL_MAX_MACRO_FLAGS = 5;

const recordTypes = ["rejected", "no_trade", "data_quality_failure", "macro_risk_block", "research_only"];
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

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function projectRootFrom(options = {}) {
  return path.resolve(options.cwd ?? process.cwd());
}

export function getLocalJournalRoot(options = {}) {
  const projectRoot = projectRootFrom(options);
  const root = path.resolve(projectRoot, ".gotrader", "journal");
  if (!root.startsWith(projectRoot)) {
    throw new Error("Resolved local journal root escaped the project directory.");
  }
  return root;
}

export function getLocalJournalFilePath({ cwd, date = todayIsoDate() } = {}) {
  return path.join(getLocalJournalRoot({ cwd }), date, "research-events.jsonl");
}

export function inferLocalJournalRecordType(event) {
  const reason = String(event?.reason ?? "").toLowerCase();
  if (event?.status === "failed") {
    return "data_quality_failure";
  }
  if ((event?.macroRiskFlags ?? []).some((flag) => flag.severity === "block") || reason.includes("macro")) {
    return "macro_risk_block";
  }
  if (reason.includes("no trade") || reason.includes("no_trade")) {
    return "no_trade";
  }
  if (String(event?.strategyVersion ?? "").includes("research")) {
    return "research_only";
  }
  return "rejected";
}

function compactMacroRiskFlags(flags = []) {
  return flags.slice(0, LOCAL_JOURNAL_MAX_MACRO_FLAGS).map((flag) => ({
    flagId: flag.flagId,
    severity: flag.severity,
    reason: flag.reason,
    eventId: flag.eventId,
    appliesToSymbols: (flag.appliesToSymbols ?? []).slice(0, 10),
    windowStart: flag.windowStart,
    windowEnd: flag.windowEnd,
    generatedAt: flag.generatedAt
  }));
}

function compactJournalEvent(event) {
  return {
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
    agentChain: event.agentChain ?? []
  };
}

export function createLocalJournalRecord(journalEvent, options = {}) {
  const compactEvent = compactJournalEvent(journalEvent);
  return {
    localJournalRecordId: options.localJournalRecordId ?? uid("local_journal"),
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
}

function collectSanitizationErrors(value, pathName = "record") {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSanitizationErrors(item, `${pathName}[${index}]`));
  }
  const errors = [];
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (secretFieldNames.has(normalizedKey)) {
      errors.push(`Secret-like field is not allowed at ${pathName}.${key}`);
    }
    if ((key === "providerPayloadIncluded" || key === "rawProviderPayloadIncluded") && child !== false) {
      errors.push(`${pathName}.${key} must be false`);
    }
    if (key === "executionAllowed" && child !== false) {
      errors.push(`${pathName}.${key} must be false`);
    }
    if (key === "approved" && child !== false) {
      errors.push(`${pathName}.${key} must be false`);
    }
    errors.push(...collectSanitizationErrors(child, `${pathName}.${key}`));
  }
  return errors;
}

export function sanitizeJournalRecord(record) {
  const sanitizedRecord = {
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
  if (!recordTypes.includes(sanitizedRecord.recordType)) {
    errors.push(`Unknown local journal recordType ${sanitizedRecord.recordType}`);
  }
  if (sanitizedRecord.storageMode !== LOCAL_JOURNAL_STORAGE_MODE) {
    errors.push(`storageMode must be ${LOCAL_JOURNAL_STORAGE_MODE}`);
  }
  if (sanitizedRecord.rawProviderPayloadIncluded !== false) {
    errors.push("rawProviderPayloadIncluded must be false");
  }
  if (sanitizedRecord.provenance.approved !== false || sanitizedRecord.provenance.executionAllowed !== false) {
    errors.push("Local journal records cannot persist approved or executable decisions in this phase.");
  }
  if (!sanitizedRecord.event?.journalEntryId || !sanitizedRecord.event?.marketSnapshotId) {
    errors.push("Local journal record must include compact JournalEvent provenance.");
  }
  return {
    ok: errors.length === 0,
    record: errors.length === 0 ? sanitizedRecord : undefined,
    errors
  };
}

export function appendLocalJournalRecord(record, options = {}) {
  const sanitized = sanitizeJournalRecord(record);
  if (!sanitized.ok) {
    return {
      ok: false,
      error: {
        code: "local_journal_sanitization_failed",
        message: sanitized.errors.join("; "),
        errors: sanitized.errors
      }
    };
  }
  const date = options.date ?? sanitized.record.createdAt.slice(0, 10);
  const filePath = getLocalJournalFilePath({ cwd: options.cwd, date });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(sanitized.record)}\n`, "utf8");
  return {
    ok: true,
    record: sanitized.record,
    filePath
  };
}

export function readLocalJournalRecords({ cwd, date = todayIsoDate(), limit = 100 } = {}) {
  const filePath = getLocalJournalFilePath({ cwd, date });
  if (!fs.existsSync(filePath)) {
    return {
      ok: true,
      records: [],
      filePath
    };
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const selectedLines = limit > 0 ? lines.slice(-limit) : lines;
  const records = selectedLines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL line ${index + 1}: ${error?.message ?? error}`);
    }
  });
  return {
    ok: true,
    records,
    filePath
  };
}

export function summarizeLocalJournalRecords({ cwd, date = todayIsoDate() } = {}) {
  const read = readLocalJournalRecords({ cwd, date, limit: 0 });
  const byRecordType = Object.fromEntries(recordTypes.map((type) => [type, 0]));
  for (const record of read.records) {
    if (byRecordType[record.recordType] !== undefined) {
      byRecordType[record.recordType] += 1;
    }
  }
  return {
    ok: true,
    summary: {
      date,
      totalRecords: read.records.length,
      byRecordType,
      latestRecordAt: read.records.at(-1)?.createdAt,
      storageMode: LOCAL_JOURNAL_STORAGE_MODE
    },
    filePath: read.filePath
  };
}
