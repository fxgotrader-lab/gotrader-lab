import type {
  IctAdvisorJournalEvent,
  IctAdvisorSignal
} from "./ictAdvisorTypes";

export const ICT_ADVISOR_JOURNAL_STORAGE_KEY = "gotrader.ict-advisor.phase1.journal.v1";
const MAX_ICT_ADVISOR_JOURNAL_EVENTS = 300;

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const buildIctAdvisorJournalEvent = (signal: IctAdvisorSignal): IctAdvisorJournalEvent => ({
  journalEventId: createId("ict_advisor_journal"),
  strategyId: signal.strategyId,
  symbol: signal.symbol,
  requestedSymbol: signal.requestedSymbol,
  brokerSymbol: signal.brokerSymbol,
  timestamp: new Date().toISOString(),
  primaryTimeframe: signal.primaryTimeframe,
  htfTimeframes: signal.htfTimeframes,
  compositeBias: signal.bias.composite,
  setup: signal.setup,
  liquiditySwept: signal.liquiditySwept,
  drawOnLiquidity: signal.drawOnLiquidity,
  dealingRangeLocation: signal.dealingRange?.currentLocation,
  displacementConfirmed: Boolean(signal.displacement),
  fvgDetected: Boolean(signal.fairValueGap),
  entryZone: signal.entryZone,
  invalidation: signal.invalidation,
  target: signal.target,
  rrEstimate: signal.rrEstimate,
  confidence: signal.confidence,
  decision: signal.decision,
  noTradeReasons: signal.noTradeReasons,
  riskNotes: signal.riskNotes,
  researchOnly: true
});

export const readIctAdvisorJournalEvents = (): IctAdvisorJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_ADVISOR_JOURNAL_STORAGE_KEY) ?? "[]") as IctAdvisorJournalEvent[];
    return Array.isArray(parsed) ? parsed.filter((event) => event.researchOnly === true) : [];
  } catch {
    return [];
  }
};
export const appendIctAdvisorJournalEvents = (events: IctAdvisorJournalEvent[]) => {
  const sanitized = events.map((event) => ({
    ...event,
    researchOnly: true as const,
    riskNotes: Array.from(new Set([...event.riskNotes, "ICT Advisor Phase 1 is research-only; authority remains none."]))
  }));
  if (!isBrowser()) {
    return {
      ok: true,
      storage: "memory_unavailable" as const,
      events: sanitized
    };
  }
  const current = readIctAdvisorJournalEvents();
  const next = [...current, ...sanitized].slice(-MAX_ICT_ADVISOR_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_ADVISOR_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return {
    ok: true,
    storage: "localStorage" as const,
    events: sanitized,
    totalEvents: next.length
  };
};

export const clearIctAdvisorJournalEvents = () => {
  if (isBrowser()) {
    window.localStorage.removeItem(ICT_ADVISOR_JOURNAL_STORAGE_KEY);
  }
};
