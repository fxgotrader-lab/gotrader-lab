import type {
  IctDailyRangeProjection,
  IctStrategyJournalEvent,
  IctStrategySignal
} from "./ictStrategySuiteTypes";

export const ICT_STRATEGY_SUITE_JOURNAL_STORAGE_KEY = "gotrader.ict-strategy-suite.journal.v1";
export const ICT_STRATEGY_SUITE_DECISION_VERSION = "ict_strategy_suite_v1" as const;

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const buildIctStrategyJournalEvent = (
  signal: IctStrategySignal,
  options: {
    dailyProfile?: IctDailyRangeProjection["dailyProfile"];
    marketSnapshotId?: string;
    sentimentSnapshotId?: string;
    timestamp?: string;
  } = {}
): IctStrategyJournalEvent => ({
  journalEventId: createId("ict_journal"),
  strategyId: signal.strategyId,
  symbol: signal.symbol,
  timestamp: options.timestamp ?? new Date().toISOString(),
  timeframeBias: signal.timeframeBias,
  dailyProfile: options.dailyProfile,
  dealingRange: signal.dealingRange,
  premiumDiscountLocation: signal.dealingRange?.currentLocation,
  liquiditySwept: signal.liquiditySwept,
  drawOnLiquidity: signal.drawOnLiquidity,
  displacement: signal.displacement,
  pdArray: signal.pdArray,
  entryZone: signal.entryZone,
  invalidation: signal.invalidation,
  target: signal.target,
  rrEstimate: signal.rrEstimate,
  confidence: signal.confidence,
  decision: signal.decision,
  noTradeReasons: signal.noTradeReasons,
  riskNotes: signal.riskNotes,
  sourceSet: "ICT Mentorship Core Content",
  researchOnly: true,
  marketSnapshotId: options.marketSnapshotId,
  sentimentSnapshotId: options.sentimentSnapshotId,
  decisionVersion: ICT_STRATEGY_SUITE_DECISION_VERSION
});

const readBrowserJournal = (): IctStrategyJournalEvent[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ICT_STRATEGY_SUITE_JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IctStrategyJournalEvent[];
    return Array.isArray(parsed) ? parsed.filter((event) => event.researchOnly === true) : [];
  } catch {
    return [];
  }
};
export const appendIctStrategyJournalEvents = (events: IctStrategyJournalEvent[], maxEvents = 500) => {
  const sanitized = events.map((event) => ({
    ...event,
    researchOnly: true as const,
    riskNotes: Array.from(new Set([...event.riskNotes, "Journal event is research-only. Execution authority none."]))
  }));
  if (typeof localStorage === "undefined") {
    return {
      ok: true,
      storage: "memory_unavailable" as const,
      events: sanitized
    };
  }
  const current = readBrowserJournal();
  const next = [...current, ...sanitized].slice(-maxEvents);
  localStorage.setItem(ICT_STRATEGY_SUITE_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return {
    ok: true,
    storage: "localStorage" as const,
    events: sanitized,
    totalEvents: next.length
  };
};

export const readIctStrategyJournalEvents = () => readBrowserJournal();

export const clearIctStrategyJournalEvents = () => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ICT_STRATEGY_SUITE_JOURNAL_STORAGE_KEY);
  }
};
