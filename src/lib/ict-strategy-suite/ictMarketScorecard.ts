import type { IctRealReplayRunOptions } from "./ictRealReplayRunner";
import {
  approximateJsonBytes,
  ictBrowserResearchDeadlineExceeded,
  ictBrowserSafeNotice,
  resolveIctBrowserResearchLimits,
  throwIfIctBrowserResearchAborted,
  yieldToBrowser,
  type IctBrowserResearchLimits
} from "./ictBrowserResearchLimits";
import {
  defaultIctRealReplayConfig,
  resolveIctRealReplaySymbolMapping,
  runIctRealReplay
} from "./ictRealReplayRunner";
import type { IctReplayBreakdownMetric } from "./ictReplayDiagnosticsTypes";
import type { IctApprovedSetupProfileRunSummary } from "./ictApprovedSetupProfileTypes";
import type { IctRealReplayRunConfig, IctRealReplayRunResult } from "./ictRealReplayRunnerTypes";
import type {
  IctMarketScorecard,
  IctMarketScorecardConfig,
  IctMarketScorecardJournalEvent,
  IctMarketScorecardStatus,
  IctMarketScorecardSymbolResult
} from "./ictMarketScorecardTypes";

const MARKET_SCORECARD_JOURNAL_STORAGE_KEY = "gotrader.ict-market-scorecard-summary.journal.v1";
const MAX_MARKET_SCORECARD_JOURNAL_EVENTS = 100;

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

export const DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS = ["MNQ", "ES", "YM", "XAUUSD", "EURUSD.pro", "BTCUSD"] as const;

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));

export const defaultIctMarketScorecardConfig = (): IctMarketScorecardConfig => {
  const defaults = defaultIctRealReplayConfig();
  return {
    requestedSymbols: [...DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS],
    primaryTimeframe: defaults.primaryTimeframes[0] ?? "5m",
    htfTimeframes: defaults.htfTimeframes,
    candleLimit: defaults.candleLimit,
    replayWindowSize: defaults.replayWindowSize,
    lookaheadCandles: defaults.lookaheadCandles
  };
};

const metric = (source: Record<string, IctReplayBreakdownMetric> | undefined, key: string) => source?.[key];

const rateFromMetric = (source: Record<string, IctReplayBreakdownMetric> | undefined, key: string, totalSignals: number) => {
  const found = metric(source, key);
  return totalSignals && found ? round(found.totalSignals / totalSignals) : undefined;
};

const bestBreakdownKey = (
  source: Record<string, IctReplayBreakdownMetric> | undefined,
  selector: (metric: IctReplayBreakdownMetric) => number
) =>
  Object.values(source ?? {})
    .filter((candidate) => candidate.totalSignals > 0)
    .sort((left, right) => selector(right) - selector(left) || right.totalSignals - left.totalSignals || left.key.localeCompare(right.key))[0]?.key;

const chooseApprovedProfile = (profiles: IctApprovedSetupProfileRunSummary[] = []) =>
  profiles
    .slice()
    .sort(
      (left, right) =>
        right.approvedTargetFirstRate - left.approvedTargetFirstRate ||
        right.approvedAverageRr - left.approvedAverageRr ||
        right.totalApproved - left.totalApproved ||
        left.profileId.localeCompare(right.profileId)
    )[0];

const unavailableSymbolResult = ({
  config,
  reason,
  requestedSymbol
}: {
  config: IctMarketScorecardConfig;
  reason: string;
  requestedSymbol: string;
}): IctMarketScorecardSymbolResult => {
  const mapping = resolveIctRealReplaySymbolMapping(requestedSymbol);
  return {
    requestedSymbol: mapping.requestedSymbol,
    brokerSymbol: mapping.brokerSymbol,
    displayLabel: mapping.displayLabel,
    primaryTimeframe: config.primaryTimeframe,
    htfTimeframes: config.htfTimeframes,
    status: "unavailable",
    statusReason: reason,
    totalWindows: 0,
    totalSignals: 0,
    totalNoTrades: 0,
    broadTargetFirstRate: 0,
    broadAverageRr: 0,
    approvedCount: 0,
    watchlistCount: 0,
    rejectedCount: 0,
    noTradeCount: 0,
    approvedRejectedRatio: 0,
    approvedTargetFirstRate: 0,
    approvedAverageRr: 0,
    signalReductionPct: 0,
    mostCommonNoTradeReasons: [],
    researchOnly: true
  };
};

export const classifyMarketScorecardStatus = (input: {
  approvedAverageRr: number;
  approvedCount: number;
  approvedTargetFirstRate: number;
  broadTargetFirstRate: number;
  signalReductionPct: number;
  statusReason?: string;
  totalSignals: number;
  totalWindows: number;
  watchlistCount: number;
}): { status: IctMarketScorecardStatus; statusReason: string } => {
  if (input.statusReason) {
    return { status: "unavailable", statusReason: input.statusReason };
  }
  if (input.totalWindows < 3 || input.totalSignals < 5) {
    return {
      status: "insufficient_data",
      statusReason: `Only ${input.totalWindows} windows and ${input.totalSignals} signal(s); scorecard needs more replay evidence.`
    };
  }
  if (
    input.approvedCount >= 3 &&
    input.approvedTargetFirstRate >= input.broadTargetFirstRate + 0.05 &&
    input.approvedAverageRr >= 2 &&
    input.signalReductionPct >= 0.2
  ) {
    return {
      status: "research_preferred",
      statusReason: "Approved profile improves target-first quality with 2R+ average RR and meaningful filtering."
    };
  }
  if (
    input.approvedCount + input.watchlistCount > 0 &&
    (input.approvedTargetFirstRate >= input.broadTargetFirstRate || input.approvedAverageRr >= 1.2)
  ) {
    return {
      status: "watchlist_only",
      statusReason: "Some approved/watchlist evidence exists, but it is not strong enough for research-preferred review."
    };
  }
  return {
    status: "noisy",
    statusReason: "Replay produced broad signals, but approved-profile quality or filtering is too weak."
  };
};

export const scoreSymbolReplaySummary = (
  result: IctRealReplayRunResult,
  fallbackRequestedSymbol?: string
): IctMarketScorecardSymbolResult => {
  const symbol = result.symbols[0];
  const mapping = resolveIctRealReplaySymbolMapping(symbol?.requestedSymbol ?? fallbackRequestedSymbol ?? result.config.requestedSymbols[0] ?? "MNQ");
  const approvedProfile = chooseApprovedProfile(result.approvedProfileResults);
  const totalSignals = result.aggregateSummary.totalSignals;
  const skippedOrFailedReason =
    symbol && symbol.status !== "completed"
      ? symbol.reason ?? `${symbol.status}_replay`
      : result.aggregateSummary.completedSymbols === 0
        ? "mt5_unavailable_or_not_configured"
        : undefined;
  const classification = classifyMarketScorecardStatus({
    approvedAverageRr: approvedProfile?.approvedAverageRr ?? 0,
    approvedCount: approvedProfile?.totalApproved ?? 0,
    approvedTargetFirstRate: approvedProfile?.approvedTargetFirstRate ?? 0,
    broadTargetFirstRate: result.aggregateSummary.targetFirstRate,
    signalReductionPct: approvedProfile?.signalReductionPct ?? 0,
    statusReason: skippedOrFailedReason,
    totalSignals,
    totalWindows: result.aggregateSummary.totalWindows,
    watchlistCount: approvedProfile?.totalWatchlist ?? 0
  });

  const newsBlockedCount =
    (metric(result.diagnostics?.byNewsRiskLevel, "blocked")?.total ?? 0) +
    (metric(result.diagnostics?.byNewsRiskLevel, "high")?.total ?? 0);
  const newsCautionCount =
    (metric(result.diagnostics?.byNewsRiskLevel, "medium")?.total ?? 0) +
    (metric(result.diagnostics?.bySessionRiskState, "caution")?.total ?? 0);

  return {
    requestedSymbol: symbol?.requestedSymbol ?? mapping.requestedSymbol,
    brokerSymbol: symbol?.brokerSymbol ?? mapping.brokerSymbol,
    displayLabel: symbol?.displayLabel ?? mapping.displayLabel,
    primaryTimeframe: symbol?.primaryTimeframe ?? result.config.primaryTimeframes[0] ?? "5m",
    htfTimeframes: symbol?.htfTimeframes?.length ? symbol.htfTimeframes : result.config.htfTimeframes,
    status: classification.status,
    statusReason: classification.statusReason,
    totalWindows: result.aggregateSummary.totalWindows,
    totalSignals,
    totalNoTrades: result.aggregateSummary.totalNoTrades,
    broadTargetFirstRate: result.aggregateSummary.targetFirstRate,
    broadAverageRr: result.aggregateSummary.averageRrAchieved,
    approvedCount: approvedProfile?.totalApproved ?? 0,
    watchlistCount: approvedProfile?.totalWatchlist ?? 0,
    rejectedCount: approvedProfile?.totalRejected ?? 0,
    noTradeCount: approvedProfile?.totalNoTrade ?? 0,
    approvedRejectedRatio: round((approvedProfile?.totalApproved ?? 0) / Math.max(1, approvedProfile?.totalRejected ?? 0), 2),
    approvedTargetFirstRate: approvedProfile?.approvedTargetFirstRate ?? 0,
    approvedAverageRr: approvedProfile?.approvedAverageRr ?? 0,
    signalReductionPct: approvedProfile?.signalReductionPct ?? 0,
    smtConfirmRate: rateFromMetric(result.diagnostics?.bySmtConfirmsCandidate, "confirms", totalSignals),
    smtRejectRate: rateFromMetric(result.diagnostics?.bySmtRejectsCandidate, "rejects", totalSignals),
    newsBlockedCount,
    newsCautionCount,
    topSetup: bestBreakdownKey(result.diagnostics?.bySetup, (item) => item.targetFirstRate),
    worstSetup: bestBreakdownKey(result.diagnostics?.bySetup, (item) => item.invalidationFirstRate),
    mostCommonNoTradeReasons: result.aggregateSummary.mostCommonNoTradeReasons,
    researchOnly: true
  };
};

const bestSymbol = (
  symbols: IctMarketScorecardSymbolResult[],
  selector: (symbol: IctMarketScorecardSymbolResult) => number
) =>
  symbols
    .filter((symbol) => symbol.status !== "unavailable" && symbol.status !== "insufficient_data" && symbol.approvedCount > 0)
    .sort((left, right) => selector(right) - selector(left) || right.approvedCount - left.approvedCount || left.requestedSymbol.localeCompare(right.requestedSymbol))[0]
    ?.requestedSymbol;

export const summarizeMarketScorecard = (symbols: IctMarketScorecardSymbolResult[]): IctMarketScorecard["summary"] => {
  const researchPreferredSymbols = symbols.filter((symbol) => symbol.status === "research_preferred").map((symbol) => symbol.requestedSymbol);
  const watchlistOnlySymbols = symbols.filter((symbol) => symbol.status === "watchlist_only").map((symbol) => symbol.requestedSymbol);
  const noisySymbols = symbols.filter((symbol) => symbol.status === "noisy").map((symbol) => symbol.requestedSymbol);
  const bestApprovedTargetFirstSymbol = bestSymbol(symbols, (symbol) => symbol.approvedTargetFirstRate);
  const bestApprovedRrSymbol = bestSymbol(symbols, (symbol) => symbol.approvedAverageRr);
  const bestApprovedRejectedRatioSymbol = bestSymbol(symbols, (symbol) => symbol.approvedRejectedRatio);
  const cleanestSymbol =
    researchPreferredSymbols[0] ??
    bestSymbol(symbols, (symbol) =>
      symbol.approvedTargetFirstRate +
      Math.min(3, symbol.approvedAverageRr) / 3 +
      symbol.signalReductionPct +
      Math.min(2, symbol.approvedRejectedRatio) / 2 -
      (symbol.smtRejectRate ?? 0)
    );

  return {
    completedSymbols: symbols.filter((symbol) => symbol.status !== "unavailable").length,
    unavailableSymbols: symbols.filter((symbol) => symbol.status === "unavailable").length,
    researchPreferredSymbols,
    watchlistOnlySymbols,
    noisySymbols,
    bestApprovedTargetFirstSymbol,
    bestApprovedRrSymbol,
    bestApprovedRejectedRatioSymbol,
    cleanestSymbol
  };
};

export async function buildIctMarketScorecard(
  configInput: Partial<IctMarketScorecardConfig> = {},
  options: IctRealReplayRunOptions = {}
): Promise<IctMarketScorecard> {
  const defaults = defaultIctMarketScorecardConfig();
  const config: IctMarketScorecardConfig = {
    requestedSymbols: configInput.requestedSymbols?.length ? configInput.requestedSymbols : defaults.requestedSymbols,
    primaryTimeframe: configInput.primaryTimeframe ?? defaults.primaryTimeframe,
    htfTimeframes: configInput.htfTimeframes?.length ? configInput.htfTimeframes : defaults.htfTimeframes,
    candleLimit: configInput.candleLimit ?? defaults.candleLimit,
    replayWindowSize: configInput.replayWindowSize ?? defaults.replayWindowSize,
    lookaheadCandles: configInput.lookaheadCandles ?? defaults.lookaheadCandles
  };
  const symbols: IctMarketScorecardSymbolResult[] = [];

  for (const requestedSymbol of config.requestedSymbols) {
    try {
      const result = await runIctRealReplay(
        {
          requestedSymbols: [requestedSymbol],
          primaryTimeframes: [config.primaryTimeframe],
          htfTimeframes: config.htfTimeframes,
          candleLimit: config.candleLimit,
          replayWindowSize: config.replayWindowSize,
          lookaheadCandles: config.lookaheadCandles,
          researchOnly: true
        } satisfies Partial<IctRealReplayRunConfig>,
        {
          ...options,
          appendJournal: false,
          includeDiagnostics: options.includeDiagnostics ?? true
        }
      );
      symbols.push(scoreSymbolReplaySummary(result, requestedSymbol));
    } catch (error) {
      symbols.push(unavailableSymbolResult({
        config,
        requestedSymbol,
        reason: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  const scorecard = sanitizeMarketScorecard({
    runId: createId("ict_market_scorecard"),
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    config,
    symbols,
    summary: summarizeMarketScorecard(symbols),
    authority,
    safety
  });
  if (options.appendJournal !== false) {
    appendIctMarketScorecardJournalEvent(buildIctMarketScorecardJournalEvent(scorecard));
  }
  return scorecard;
}

export interface IctBrowserSafeMarketScorecardOptions extends IctRealReplayRunOptions {
  limits?: Partial<IctBrowserResearchLimits>;
  signal?: AbortSignal;
  onProgress?: (progress: NonNullable<IctMarketScorecard["progress"]>) => void;
}

export async function buildIctMarketScorecardBrowserSafe(
  configInput: Partial<IctMarketScorecardConfig> = {},
  options: IctBrowserSafeMarketScorecardOptions = {}
): Promise<IctMarketScorecard> {
  const limits = resolveIctBrowserResearchLimits(options.limits);
  const defaults = defaultIctMarketScorecardConfig();
  const requestedSymbols = (configInput.requestedSymbols?.length ? configInput.requestedSymbols : defaults.requestedSymbols)
    .slice(0, limits.maxSymbolsPerScorecard);
  const sourceSymbolCount = configInput.requestedSymbols?.length ?? defaults.requestedSymbols.length;
  const config: IctMarketScorecardConfig = {
    requestedSymbols,
    primaryTimeframe: configInput.primaryTimeframe ?? defaults.primaryTimeframe,
    htfTimeframes: configInput.htfTimeframes?.length ? configInput.htfTimeframes : defaults.htfTimeframes,
    candleLimit: Math.min(configInput.candleLimit ?? defaults.candleLimit, limits.maxCandlesPerSymbol),
    replayWindowSize: configInput.replayWindowSize ?? defaults.replayWindowSize,
    lookaheadCandles: configInput.lookaheadCandles ?? defaults.lookaheadCandles
  };
  const startedAt = Date.now();
  const deadlineAt = startedAt + limits.maxRuntimeMs;
  const symbols: IctMarketScorecardSymbolResult[] = [];
  const warnings = [ictBrowserSafeNotice];
  if (sourceSymbolCount > config.requestedSymbols.length) {
    warnings.push(`Browser scorecard limited to ${config.requestedSymbols.length} of ${sourceSymbolCount} configured symbols.`);
  }
  if ((configInput.candleLimit ?? defaults.candleLimit) > config.candleLimit) {
    warnings.push(`Candle limit capped at ${config.candleLimit} per symbol in browser-safe mode.`);
  }

  for (const requestedSymbol of config.requestedSymbols) {
    throwIfIctBrowserResearchAborted(options.signal);
    if (ictBrowserResearchDeadlineExceeded(deadlineAt)) {
      warnings.push(`Scorecard stopped after ${limits.maxRuntimeMs}ms browser-safe runtime cap.`);
      break;
    }
    options.onProgress?.({
      completedSymbols: symbols.length,
      currentSymbol: requestedSymbol,
      totalSymbols: config.requestedSymbols.length
    });
    try {
      const result = await runIctRealReplay(
        {
          requestedSymbols: [requestedSymbol],
          primaryTimeframes: [config.primaryTimeframe],
          htfTimeframes: config.htfTimeframes,
          candleLimit: config.candleLimit,
          replayWindowSize: config.replayWindowSize,
          lookaheadCandles: config.lookaheadCandles,
          researchOnly: true
        } satisfies Partial<IctRealReplayRunConfig>,
        {
          ...options,
          appendJournal: false,
          includeDiagnostics: options.includeDiagnostics ?? true,
          includeReplayResults: false,
          maxReplayWindows: limits.maxReplayWindows
        }
      );
      symbols.push(scoreSymbolReplaySummary(result, requestedSymbol));
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") throw error;
      symbols.push(unavailableSymbolResult({
        config,
        requestedSymbol,
        reason: error instanceof Error ? error.message : String(error)
      }));
    }
    options.onProgress?.({
      completedSymbols: symbols.length,
      totalSymbols: config.requestedSymbols.length
    });
    await yieldToBrowser();
  }

  const completedSymbols = symbols.filter((symbol) => symbol.status !== "unavailable").length;
  const timedOut = symbols.length < config.requestedSymbols.length && ictBrowserResearchDeadlineExceeded(deadlineAt);
  const scorecard = sanitizeMarketScorecard({
    runId: createId("ict_market_scorecard"),
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    status: timedOut ? (completedSymbols ? "partial" : "timed_out") : completedSymbols ? (symbols.length < sourceSymbolCount ? "partial" : "completed") : "unavailable",
    browserSafe: true,
    warnings,
    progress: {
      completedSymbols: symbols.length,
      totalSymbols: config.requestedSymbols.length
    },
    config,
    symbols,
    summary: summarizeMarketScorecard(symbols),
    authority,
    safety
  });
  const compacted = approximateJsonBytes(scorecard) > limits.maxStoredResultBytes
    ? sanitizeMarketScorecard({
        ...scorecard,
        warnings: [...(scorecard.warnings ?? []), `Scorecard output compacted below ${limits.maxStoredResultBytes} bytes.`],
        symbols: scorecard.symbols.slice(0, limits.maxSymbolsPerScorecard).map((symbol) => ({
          ...symbol,
          mostCommonNoTradeReasons: symbol.mostCommonNoTradeReasons.slice(0, 3)
        }))
      })
    : scorecard;
  const finalScorecard = {
    ...compacted,
    serializedBytes: approximateJsonBytes(compacted)
  };
  if (options.appendJournal === true && completedSymbols > 0) {
    appendIctMarketScorecardJournalEvent(buildIctMarketScorecardJournalEvent(finalScorecard));
  }
  return finalScorecard;
}

export const buildIctMarketScorecardJournalEvent = (scorecard: IctMarketScorecard): IctMarketScorecardJournalEvent => ({
  eventType: "ict_market_scorecard_summary",
  journalEventId: createId("ict_market_scorecard_journal"),
  runId: scorecard.runId,
  generatedAt: scorecard.generatedAt,
  requestedSymbols: scorecard.config.requestedSymbols,
  completedSymbols: scorecard.summary.completedSymbols,
  unavailableSymbols: scorecard.summary.unavailableSymbols,
  researchPreferredSymbols: scorecard.summary.researchPreferredSymbols,
  watchlistOnlySymbols: scorecard.summary.watchlistOnlySymbols,
  noisySymbols: scorecard.summary.noisySymbols,
  bestApprovedTargetFirstSymbol: scorecard.summary.bestApprovedTargetFirstSymbol,
  bestApprovedRrSymbol: scorecard.summary.bestApprovedRrSymbol,
  bestApprovedRejectedRatioSymbol: scorecard.summary.bestApprovedRejectedRatioSymbol,
  totalSymbols: scorecard.symbols.length,
  researchOnly: true,
  authority,
  safety
});

export const readIctMarketScorecardJournalEvents = (): IctMarketScorecardJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MARKET_SCORECARD_JOURNAL_STORAGE_KEY) ?? "[]") as IctMarketScorecardJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_market_scorecard_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctMarketScorecardJournalEvent = (event: IctMarketScorecardJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  }
  const current = readIctMarketScorecardJournalEvents();
  const next = [...current, sanitized].slice(-MAX_MARKET_SCORECARD_JOURNAL_EVENTS);
  window.localStorage.setItem(MARKET_SCORECARD_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const sanitizeMarketScorecard = (scorecard: IctMarketScorecard): IctMarketScorecard => {
  const sanitized = JSON.parse(JSON.stringify(scorecard)) as IctMarketScorecard;
  sanitized.researchOnly = true;
  sanitized.status = sanitized.status ?? "completed";
  sanitized.warnings = sanitized.warnings?.slice(0, 8);
  sanitized.authority = authority;
  sanitized.safety = safety;
  sanitized.symbols = sanitized.symbols.map((symbol) => ({
    ...symbol,
    broadTargetFirstRate: round(symbol.broadTargetFirstRate),
    broadAverageRr: round(symbol.broadAverageRr, 2),
    approvedRejectedRatio: round(symbol.approvedRejectedRatio, 2),
    approvedTargetFirstRate: round(symbol.approvedTargetFirstRate),
    approvedAverageRr: round(symbol.approvedAverageRr, 2),
    signalReductionPct: round(symbol.signalReductionPct),
    smtConfirmRate: symbol.smtConfirmRate === undefined ? undefined : round(symbol.smtConfirmRate),
    smtRejectRate: symbol.smtRejectRate === undefined ? undefined : round(symbol.smtRejectRate),
    researchOnly: true
  }));
  sanitized.summary = summarizeMarketScorecard(sanitized.symbols);
  return sanitized;
};

export const assertIctMarketScorecardOutputIsCompact = (output: {
  journalEvent?: IctMarketScorecardJournalEvent;
  scorecard?: IctMarketScorecard;
}) => {
  const withoutSafety = {
    journalEvent: output.journalEvent ? { ...output.journalEvent, safety: undefined } : undefined,
    scorecard: output.scorecard ? { ...output.scorecard, safety: undefined } : undefined
  };
  const serialized = JSON.stringify(withoutSafety);
  return {
    ok:
      (output.scorecard?.researchOnly ?? true) === true &&
      (output.journalEvent?.researchOnly ?? true) === true &&
      (output.scorecard?.authority.executionAuthority ?? "none") === "none" &&
      (output.scorecard?.authority.brokerAuthority ?? "none") === "none" &&
      (output.scorecard?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
