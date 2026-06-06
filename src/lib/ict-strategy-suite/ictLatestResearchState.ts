import type { IctManualReplayReviewResult } from "./ictManualReplayReviewTypes";
import type { IctMarketScorecard } from "./ictMarketScorecardTypes";
import type { IctMonteCarloSummary } from "./ictMonteCarloTypes";
import type {
  IctLatestMonteCarloSnapshot,
  IctLatestReplaySnapshot,
  IctLatestResearchSource,
  IctLatestResearchState,
  IctLatestResearchStateJournalEvent,
  IctLatestScorecardSnapshot
} from "./ictLatestResearchStateTypes";

export const ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT = "gotrader:ict-latest-research-state-updated";

const ICT_LATEST_RESEARCH_STATE_STORAGE_KEY = "gotrader.ict-latest-research-state.v1";
const ICT_LATEST_RESEARCH_STATE_JOURNAL_STORAGE_KEY = "gotrader.ict-latest-research-state.journal.v1";
const MAX_LATEST_RESEARCH_STATE_JOURNAL_EVENTS = 100;

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

let memoryState: IctLatestResearchState | undefined;
let memoryJournal: IctLatestResearchStateJournalEvent[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const generatedNow = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "unknown_error");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const copyStringList = (values: unknown) =>
  Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").slice(0, 12) : [];

const publish = (state: IctLatestResearchState, source?: IctLatestResearchSource) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT, { detail: { state, source } }));
  }
};

export const buildLatestReplaySnapshot = (result: IctManualReplayReviewResult): IctLatestReplaySnapshot => ({
  runId: result.runId,
  generatedAt: result.generatedAt,
  requestedSymbol: result.requestedSymbol,
  brokerSymbol: result.brokerSymbol,
  primaryTimeframe: result.primaryTimeframe,
  totalSignals: result.totalSignals,
  targetFirstRate: round(result.targetFirstRate),
  approvedTargetFirstRate: round(result.approvedTargetFirstRate),
  averageRrAchieved: round(result.averageRrAchieved, 2),
  approvedAverageRr: round(result.approvedAverageRr, 2),
  researchOnly: true
});

export const buildLatestMonteCarloSnapshot = (summary: IctMonteCarloSummary): IctLatestMonteCarloSnapshot => ({
  generatedAt: summary.generatedAt,
  source: summary.source,
  usableOutcomes: summary.input.usableOutcomes,
  robustnessRating: summary.recommendation.robustnessRating,
  medianEndingR: round(summary.performance.medianEndingR, 2),
  fifthPercentileEndingR: round(summary.performance.fifthPercentileEndingR, 2),
  medianMaxDrawdownPct: round(summary.performance.medianMaxDrawdownPct),
  worstMaxDrawdownPct: round(summary.performance.worstMaxDrawdownPct),
  riskOfRuinPct: round(summary.performance.riskOfRuinPct),
  recommendedMaxRiskPerTradePct: round(summary.recommendation.recommendedMaxRiskPerTradePct),
  warnings: summary.recommendation.warnings.slice(0, 8),
  researchOnly: true
});

export const buildLatestScorecardSnapshot = (scorecard: IctMarketScorecard): IctLatestScorecardSnapshot => ({
  runId: scorecard.runId,
  generatedAt: scorecard.generatedAt,
  completedSymbols: scorecard.summary.completedSymbols,
  researchPreferredSymbols: scorecard.summary.researchPreferredSymbols.slice(0, 8),
  watchlistOnlySymbols: scorecard.summary.watchlistOnlySymbols.slice(0, 8),
  noisySymbols: scorecard.summary.noisySymbols.slice(0, 8),
  bestApprovedTargetFirstSymbol: scorecard.summary.bestApprovedTargetFirstSymbol,
  bestApprovedRrSymbol: scorecard.summary.bestApprovedRrSymbol,
  researchOnly: true
});

const sanitizeReplaySnapshot = (snapshot?: Partial<IctLatestReplaySnapshot>): IctLatestReplaySnapshot | undefined => {
  if (!snapshot?.generatedAt) return undefined;
  return {
    runId: typeof snapshot.runId === "string" ? snapshot.runId : undefined,
    generatedAt: String(snapshot.generatedAt),
    requestedSymbol: typeof snapshot.requestedSymbol === "string" ? snapshot.requestedSymbol : undefined,
    brokerSymbol: typeof snapshot.brokerSymbol === "string" ? snapshot.brokerSymbol : undefined,
    primaryTimeframe: typeof snapshot.primaryTimeframe === "string" ? snapshot.primaryTimeframe : undefined,
    totalSignals: finite(snapshot.totalSignals) ? Math.max(0, Math.round(snapshot.totalSignals)) : undefined,
    targetFirstRate: finite(snapshot.targetFirstRate) ? round(snapshot.targetFirstRate) : undefined,
    approvedTargetFirstRate: finite(snapshot.approvedTargetFirstRate) ? round(snapshot.approvedTargetFirstRate) : undefined,
    averageRrAchieved: finite(snapshot.averageRrAchieved) ? round(snapshot.averageRrAchieved, 2) : undefined,
    approvedAverageRr: finite(snapshot.approvedAverageRr) ? round(snapshot.approvedAverageRr, 2) : undefined,
    researchOnly: true
  };
};

const sanitizeMonteCarloSnapshot = (snapshot?: Partial<IctLatestMonteCarloSnapshot>): IctLatestMonteCarloSnapshot | undefined => {
  if (!snapshot?.generatedAt || !snapshot.robustnessRating) return undefined;
  return {
    generatedAt: String(snapshot.generatedAt),
    source: String(snapshot.source ?? "manual_replay_review"),
    usableOutcomes: finite(snapshot.usableOutcomes) ? Math.max(0, Math.round(snapshot.usableOutcomes)) : 0,
    robustnessRating: snapshot.robustnessRating,
    medianEndingR: finite(snapshot.medianEndingR) ? round(snapshot.medianEndingR, 2) : undefined,
    fifthPercentileEndingR: finite(snapshot.fifthPercentileEndingR) ? round(snapshot.fifthPercentileEndingR, 2) : undefined,
    medianMaxDrawdownPct: finite(snapshot.medianMaxDrawdownPct) ? round(snapshot.medianMaxDrawdownPct) : undefined,
    worstMaxDrawdownPct: finite(snapshot.worstMaxDrawdownPct) ? round(snapshot.worstMaxDrawdownPct) : undefined,
    riskOfRuinPct: finite(snapshot.riskOfRuinPct) ? round(snapshot.riskOfRuinPct) : undefined,
    recommendedMaxRiskPerTradePct: finite(snapshot.recommendedMaxRiskPerTradePct)
      ? round(snapshot.recommendedMaxRiskPerTradePct)
      : undefined,
    warnings: copyStringList(snapshot.warnings),
    researchOnly: true
  };
};

const sanitizeScorecardSnapshot = (snapshot?: Partial<IctLatestScorecardSnapshot>): IctLatestScorecardSnapshot | undefined => {
  if (!snapshot?.generatedAt) return undefined;
  return {
    runId: typeof snapshot.runId === "string" ? snapshot.runId : undefined,
    generatedAt: String(snapshot.generatedAt),
    completedSymbols: finite(snapshot.completedSymbols) ? Math.max(0, Math.round(snapshot.completedSymbols)) : 0,
    researchPreferredSymbols: copyStringList(snapshot.researchPreferredSymbols),
    watchlistOnlySymbols: copyStringList(snapshot.watchlistOnlySymbols),
    noisySymbols: copyStringList(snapshot.noisySymbols),
    bestApprovedTargetFirstSymbol: typeof snapshot.bestApprovedTargetFirstSymbol === "string"
      ? snapshot.bestApprovedTargetFirstSymbol
      : undefined,
    bestApprovedRrSymbol: typeof snapshot.bestApprovedRrSymbol === "string" ? snapshot.bestApprovedRrSymbol : undefined,
    researchOnly: true
  };
};

export const sanitizeLatestResearchState = (
  state?: Partial<IctLatestResearchState> | null
): IctLatestResearchState | undefined => {
  if (!state) return undefined;
  const latestReplay = sanitizeReplaySnapshot(state.latestReplay);
  const latestMonteCarlo = sanitizeMonteCarloSnapshot(state.latestMonteCarlo);
  const latestScorecard = sanitizeScorecardSnapshot(state.latestScorecard);
  if (!latestReplay && !latestMonteCarlo && !latestScorecard) return undefined;
  return {
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : generatedNow(),
    researchOnly: true,
    latestReplay,
    latestMonteCarlo,
    latestScorecard,
    authority,
    safety
  };
};

export const readLatestResearchState = (): IctLatestResearchState | undefined => {
  if (!isBrowser()) return memoryState;
  try {
    return sanitizeLatestResearchState(JSON.parse(window.localStorage.getItem(ICT_LATEST_RESEARCH_STATE_STORAGE_KEY) ?? "null"));
  } catch {
    return undefined;
  }
};

export const buildIctLatestResearchStateJournalEvent = (
  state: IctLatestResearchState,
  source: IctLatestResearchSource
): IctLatestResearchStateJournalEvent => ({
  eventType: "ict_latest_research_state_updated",
  journalEventId: createId("ict_latest_state"),
  updatedAt: state.updatedAt,
  source,
  hasReplay: Boolean(state.latestReplay),
  hasMonteCarlo: Boolean(state.latestMonteCarlo),
  hasScorecard: Boolean(state.latestScorecard),
  monteCarloRobustnessRating: state.latestMonteCarlo?.robustnessRating,
  riskOfRuinPct: state.latestMonteCarlo?.riskOfRuinPct,
  recommendedMaxRiskPerTradePct: state.latestMonteCarlo?.recommendedMaxRiskPerTradePct,
  researchOnly: true,
  authority,
  safety
});

export const readIctLatestResearchStateJournalEvents = (): IctLatestResearchStateJournalEvent[] => {
  if (!isBrowser()) return memoryJournal;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_LATEST_RESEARCH_STATE_JOURNAL_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((event) => event?.eventType === "ict_latest_research_state_updated" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctLatestResearchStateJournalEvent = (event: IctLatestResearchStateJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_LATEST_RESEARCH_STATE_JOURNAL_EVENTS);
    return { ok: true, storage: "memory" as const, event: sanitized, totalEvents: memoryJournal.length };
  }
  try {
    const next = [...readIctLatestResearchStateJournalEvents(), sanitized].slice(-MAX_LATEST_RESEARCH_STATE_JOURNAL_EVENTS);
    window.localStorage.setItem(ICT_LATEST_RESEARCH_STATE_JOURNAL_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
  } catch (error) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_LATEST_RESEARCH_STATE_JOURNAL_EVENTS);
    return {
      ok: false,
      storage: "localStorage_failed" as const,
      event: sanitized,
      error: errorMessage(error)
    };
  }
};

export const saveLatestResearchStatePatch = (
  patch: Partial<Pick<IctLatestResearchState, "latestReplay" | "latestMonteCarlo" | "latestScorecard">>,
  source: IctLatestResearchSource = "current_read"
) => {
  const current = readLatestResearchState();
  const next = sanitizeLatestResearchState({
    ...current,
    ...patch,
    updatedAt: generatedNow(),
    researchOnly: true,
    authority,
    safety
  }) ?? {
    updatedAt: generatedNow(),
    researchOnly: true as const,
    authority,
    safety
  };
  memoryState = next;
  if (isBrowser()) {
    try {
      window.localStorage.setItem(ICT_LATEST_RESEARCH_STATE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Memory fallback keeps the advisor responsive when localStorage is blocked or full.
    }
  }
  appendIctLatestResearchStateJournalEvent(buildIctLatestResearchStateJournalEvent(next, source));
  try {
    publish(next, source);
  } catch {
    // A failed event dispatch should not interrupt a manual advisor action.
  }
  return next;
};

export const clearLatestResearchState = () => {
  memoryState = undefined;
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(ICT_LATEST_RESEARCH_STATE_STORAGE_KEY);
    } catch {
      // Clearing memory state is enough when browser storage is unavailable.
    }
  }
  return { ok: true, authority, safety };
};

export const assertIctLatestResearchStateIsCompact = (
  state?: IctLatestResearchState,
  journalEvent?: IctLatestResearchStateJournalEvent
) => {
  const serialized = JSON.stringify({ state, journalEvent });
  return {
    ok:
      (state?.researchOnly ?? true) === true &&
      (journalEvent?.researchOnly ?? true) === true &&
      (state?.authority.executionAuthority ?? "none") === "none" &&
      (state?.authority.brokerAuthority ?? "none") === "none" &&
      (state?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:|"pathsSample"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
