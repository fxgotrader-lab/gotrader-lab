import type { IctResearchSignal } from "./ictSignalContractTypes";
import type {
  IctCmdPaperTrackingCompactCandle,
  IctCmdPaperTrackingCreateResult,
  IctCmdPaperTrackingEligibility,
  IctCmdPaperTrackingJournalEvent,
  IctCmdPaperTrackingJournalEventType,
  IctCmdPaperTrackingRecord,
  IctCmdPaperTrackingUpdateResult
} from "./ictCmdPaperTrackingTypes";

export const ICT_CMD_PAPER_TRACKING_STORAGE_KEY = "gotrader.ict-cmd-paper-tracking.active.v1";
export const ICT_CMD_PAPER_TRACKING_JOURNAL_STORAGE_KEY = "gotrader.ict-cmd-paper-tracking.journal.v1";
export const ICT_CMD_PAPER_TRACKING_UPDATED_EVENT = "gotrader:ict-cmd-paper-tracking-updated";
export const ICT_CMD_MODEL_NAME = "consolidation_manipulation_distribution";

const MAX_ICT_CMD_PAPER_TRACKING_JOURNAL_EVENTS = 200;

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  realOrderPlaced: false as const,
  brokerMutation: false as const,
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

let memoryTrackingRecord: IctCmdPaperTrackingRecord | undefined;
let memoryJournal: IctCmdPaperTrackingJournalEvent[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];

const dispatchTrackingEvent = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(ICT_CMD_PAPER_TRACKING_UPDATED_EVENT));
};

const sanitizeRecord = (record: IctCmdPaperTrackingRecord): IctCmdPaperTrackingRecord => ({
  ...record,
  sourceModel: ICT_CMD_MODEL_NAME,
  modelQualityLane: "paper_watchlist",
  approvedProfileStatus: "paper_watchlist_candidate",
  paperOnly: true,
  researchOnly: true,
  executionAllowed: false,
  authority,
  safety
});

const buildJournalEvent = (
  record: IctCmdPaperTrackingRecord,
  eventType: IctCmdPaperTrackingJournalEventType,
  generatedAt = now()
): IctCmdPaperTrackingJournalEvent => ({
  eventType,
  journalEventId: createId("ict_cmd_paper_tracking_journal"),
  trackingId: record.trackingId,
  sourceSignalId: record.sourceSignalId,
  generatedAt,
  lastCheckedAt: record.lastCheckedAt,
  state: record.state,
  outcome: record.outcome,
  sourceModel: ICT_CMD_MODEL_NAME,
  requestedSymbol: record.requestedSymbol,
  brokerSymbol: record.brokerSymbol,
  primaryTimeframe: record.primaryTimeframe,
  side: record.side,
  setup: record.setup,
  target: record.target,
  invalidation: record.invalidation,
  rrEstimate: record.rrEstimate,
  confidence: record.confidence,
  paperOnly: true,
  researchOnly: true,
  executionAllowed: false,
  realOrderPlaced: false,
  brokerMutation: false,
  authority,
  safety
});

export const evaluateCmdPaperTrackingEligibility = (signal: IctResearchSignal): IctCmdPaperTrackingEligibility => {
  const reasons = unique([
    signal.modelName !== ICT_CMD_MODEL_NAME ? "Only CMD paper-watchlist candidates can create CMD paper tracking." : undefined,
    signal.status !== "watchlist_signal" ? "Signal must be in the watchlist signal lane." : undefined,
    signal.approvedProfileStatus !== "paper_watchlist_candidate" ? "Approved-profile status must be paper_watchlist_candidate." : undefined,
    signal.modelQualityLane !== "paper_watchlist" ? "Model quality lane must be paper_watchlist." : undefined,
    signal.paperWatchlistEligible !== true ? "Paper-watchlist eligibility is not present." : undefined,
    signal.side !== "long" && signal.side !== "short" ? "Tracking requires a long or short research side." : undefined,
    !finite(signal.target) ? "Target is missing." : undefined,
    !finite(signal.invalidation) ? "Invalidation is missing." : undefined,
    !finite(signal.rrEstimate) ? "RR estimate is missing." : undefined,
    signal.executionAllowed !== false ? "Execution must remain disabled." : undefined,
    signal.authority.executionAuthority !== "none" ? "Execution authority must remain none." : undefined,
    signal.authority.brokerAuthority !== "none" ? "Broker authority must remain none." : undefined,
    signal.authority.readinessOverrideAuthority !== "none" ? "Readiness override authority must remain none." : undefined
  ]);
  return {
    eligible: reasons.length === 0,
    status: reasons.length === 0 ? "eligible" : "not_eligible",
    reasons: reasons.length ? reasons : ["CMD strict paper-watchlist candidate is eligible for paper-only tracking."],
    warnings: [
      "Paper tracking is read-only evidence collection only.",
      "No live execution, broker mutation, or readiness promotion is allowed."
    ]
  };
};

export const isCmdPaperWatchlistSignal = (signal: IctResearchSignal) =>
  evaluateCmdPaperTrackingEligibility(signal).eligible;

export const createCmdPaperTrackingFromResearchSignal = (
  signal: IctResearchSignal,
  options: { generatedAt?: string; state?: "pending" | "active" } = {}
): IctCmdPaperTrackingCreateResult => {
  const eligibility = evaluateCmdPaperTrackingEligibility(signal);
  if (!eligibility.eligible || signal.side === "flat" || !finite(signal.target) || !finite(signal.invalidation) || !finite(signal.rrEstimate)) {
    return {
      ok: false,
      reason: eligibility.reasons[0] ?? "CMD paper tracking is not eligible.",
      eligibility,
      authority,
      safety
    };
  }
  const generatedAt = options.generatedAt ?? now();
  const record = sanitizeRecord({
    trackingId: createId("ict_cmd_paper_tracking"),
    sourceSignalId: signal.signalId,
    generatedAt,
    lastCheckedAt: generatedAt,
    sourceModel: ICT_CMD_MODEL_NAME,
    requestedSymbol: signal.requestedSymbol,
    brokerSymbol: signal.brokerSymbol,
    primaryTimeframe: signal.primaryTimeframe,
    side: signal.side,
    setup: signal.setup,
    target: signal.target,
    invalidation: signal.invalidation,
    rrEstimate: signal.rrEstimate,
    confidence: signal.confidence,
    state: options.state ?? "active",
    outcome: "open",
    modelQualityLane: "paper_watchlist",
    approvedProfileStatus: "paper_watchlist_candidate",
    paperOnly: true,
    researchOnly: true,
    executionAllowed: false,
    notes: [
      signal.paperWatchlistReason ?? "CMD paper-watchlist - paper-test only.",
      signal.paperWatchlistEvidenceSummary ?? "Compact CMD paper-watchlist evidence only.",
      "No live execution, broker mutation, or readiness promotion."
    ],
    authority,
    safety
  });
  return {
    ok: true,
    record,
    journalEvent: buildJournalEvent(record, "ict_cmd_paper_tracking_created", generatedAt)
  };
};

const sortedCompactCandles = (candles: IctCmdPaperTrackingCompactCandle[]) =>
  candles
    .filter((candle) => candle.timestamp && finite(candle.high) && finite(candle.low))
    .slice()
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

export const updateCmdPaperTrackingWithCandles = (
  record: IctCmdPaperTrackingRecord,
  candles: IctCmdPaperTrackingCompactCandle[],
  options: { checkedAt?: string } = {}
): IctCmdPaperTrackingUpdateResult => {
  const sanitized = sanitizeRecord(record);
  if (sanitized.state === "target_hit" || sanitized.state === "invalidation_hit" || sanitized.state === "expired" || sanitized.state === "cancelled") {
    return {
      record: sanitized,
      checkedCandleCount: 0,
      changed: false,
      reason: `Tracking already ${sanitized.state}.`
    };
  }
  const checkedAt = options.checkedAt ?? now();
  const eligibleCandles = sortedCompactCandles(candles).filter(
    (candle) => new Date(candle.timestamp).getTime() >= new Date(sanitized.generatedAt).getTime()
  );
  let nextRecord: IctCmdPaperTrackingRecord = {
    ...sanitized,
    lastCheckedAt: checkedAt
  };
  for (const candle of eligibleCandles) {
    const targetHit = sanitized.side === "long" ? candle.high >= sanitized.target : candle.low <= sanitized.target;
    const invalidationHit = sanitized.side === "long" ? candle.low <= sanitized.invalidation : candle.high >= sanitized.invalidation;
    if (targetHit || invalidationHit) {
      nextRecord = sanitizeRecord({
        ...nextRecord,
        state: targetHit ? "target_hit" : "invalidation_hit",
        outcome: targetHit ? "target_hit" : "invalidation_hit",
        lastCheckedAt: candle.timestamp,
        lastPriceChecked: {
          at: candle.timestamp,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          source: "read_only_candle"
        },
        notes: [
          ...nextRecord.notes,
          targetHit
            ? "CMD paper tracking target reached by read-only candle high/low."
            : "CMD paper tracking invalidation reached by read-only candle high/low."
        ]
      });
      return {
        record: nextRecord,
        journalEvent: buildJournalEvent(nextRecord, "ict_cmd_paper_tracking_updated", checkedAt),
        checkedCandleCount: eligibleCandles.length,
        changed: true,
        reason: targetHit ? "target_hit" : "invalidation_hit"
      };
    }
  }
  if (eligibleCandles.length) {
    const latest = eligibleCandles[eligibleCandles.length - 1];
    nextRecord = sanitizeRecord({
      ...nextRecord,
      state: "active",
      outcome: "open",
      lastPriceChecked: {
        at: latest.timestamp,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        source: "read_only_candle"
      }
    });
  }
  return {
    record: nextRecord,
    journalEvent: buildJournalEvent(nextRecord, "ict_cmd_paper_tracking_updated", checkedAt),
    checkedCandleCount: eligibleCandles.length,
    changed: eligibleCandles.length > 0,
    reason: eligibleCandles.length ? "still_active" : "no_new_compact_candles"
  };
};

export const cancelCmdPaperTracking = (
  record: IctCmdPaperTrackingRecord,
  reason = "Cancelled manually."
): IctCmdPaperTrackingRecord =>
  sanitizeRecord({
    ...record,
    state: "cancelled",
    outcome: "cancelled",
    lastCheckedAt: now(),
    notes: [...record.notes, reason]
  });

export const expireCmdPaperTracking = (
  record: IctCmdPaperTrackingRecord,
  reason = "Expired before target or invalidation."
): IctCmdPaperTrackingRecord =>
  sanitizeRecord({
    ...record,
    state: "expired",
    outcome: "expired",
    lastCheckedAt: now(),
    notes: [...record.notes, reason]
  });

export const readActiveCmdPaperTracking = (): IctCmdPaperTrackingRecord | undefined => {
  if (!isBrowser()) return memoryTrackingRecord;
  try {
    const raw = window.localStorage.getItem(ICT_CMD_PAPER_TRACKING_STORAGE_KEY);
    return raw ? sanitizeRecord(JSON.parse(raw) as IctCmdPaperTrackingRecord) : undefined;
  } catch {
    return undefined;
  }
};

export const saveActiveCmdPaperTracking = (record: IctCmdPaperTrackingRecord) => {
  const sanitized = sanitizeRecord(record);
  memoryTrackingRecord = sanitized;
  if (isBrowser()) {
    window.localStorage.setItem(ICT_CMD_PAPER_TRACKING_STORAGE_KEY, JSON.stringify(sanitized));
  }
  dispatchTrackingEvent();
  return { ok: true, record: sanitized };
};

export const clearActiveCmdPaperTracking = () => {
  memoryTrackingRecord = undefined;
  if (isBrowser()) {
    window.localStorage.removeItem(ICT_CMD_PAPER_TRACKING_STORAGE_KEY);
  }
  dispatchTrackingEvent();
  return { ok: true };
};

export const readIctCmdPaperTrackingJournalEvents = (): IctCmdPaperTrackingJournalEvent[] => {
  if (!isBrowser()) return memoryJournal;
  try {
    return JSON.parse(window.localStorage.getItem(ICT_CMD_PAPER_TRACKING_JOURNAL_STORAGE_KEY) ?? "[]") as IctCmdPaperTrackingJournalEvent[];
  } catch {
    return [];
  }
};

export const appendIctCmdPaperTrackingJournalEvent = (event: IctCmdPaperTrackingJournalEvent) => {
  const sanitized: IctCmdPaperTrackingJournalEvent = {
    ...event,
    sourceModel: ICT_CMD_MODEL_NAME,
    paperOnly: true as const,
    researchOnly: true as const,
    executionAllowed: false as const,
    realOrderPlaced: false as const,
    brokerMutation: false as const,
    authority,
    safety
  };
  if (!isBrowser()) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_ICT_CMD_PAPER_TRACKING_JOURNAL_EVENTS);
    return { ok: true, storage: "memory" as const, event: sanitized, totalEvents: memoryJournal.length };
  }
  const next = [...readIctCmdPaperTrackingJournalEvents(), sanitized].slice(-MAX_ICT_CMD_PAPER_TRACKING_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_CMD_PAPER_TRACKING_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  dispatchTrackingEvent();
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const buildIctCmdPaperTrackingJournalEvent = buildJournalEvent;

export const assertIctCmdPaperTrackingIsSafe = (
  record: IctCmdPaperTrackingRecord,
  event?: IctCmdPaperTrackingJournalEvent
) => {
  const serialized = JSON.stringify({ record, event });
  return {
    ok:
      record.paperOnly === true &&
      record.researchOnly === true &&
      record.executionAllowed === false &&
      record.authority.executionAuthority === "none" &&
      record.authority.brokerAuthority === "none" &&
      record.authority.readinessOverrideAuthority === "none" &&
      record.safety.realOrderPlaced === false &&
      record.safety.brokerMutation === false &&
      record.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new TextEncoder().encode(serialized).length
  };
};
