import { fetchMt5ReadOnlyCandles, loadMt5ReadOnlySettings } from "../integrations/mt5/mt5ReadOnlyClient";
import { createActiveMt5ReadOnlyCandleFeed, mt5ReadOnlyCandlesToGoTraderCandles } from "../integrations/mt5/mt5ReadOnlyNormalizer";
import {
  displayLabelForMt5Mapping,
  findDefaultMt5SymbolMapping,
  mt5ReadOnlyDefaultSymbolMappings,
  resolveDefaultMt5BrokerSymbol,
  sanitizeMt5HigherTimeframes,
  sanitizeMt5ReadOnlyTimeframe
} from "../integrations/mt5/mt5SymbolSettings";
import type { Candle, Timeframe } from "../types";
import { ICT_INDEX_SMT_INSTRUMENTS, smtSymbolMatchesIndexGroup } from "./ictIndexSmt";
import type { IctIndexComparisonCandles } from "./ictIndexSmtTypes";
import type { IctNewsSessionRiskContextInput } from "./ictNewsSessionRiskTypes";
import { runIctReplayValidation, sanitizeReplayOutput } from "./ictReplayValidation";
import {
  appendIctApprovedSetupProfileJournalEvents,
  buildApprovedSetupProfileRunSummaries,
  buildIctApprovedSetupProfileJournalEvents
} from "./ictApprovedSetupProfile";
import {
  appendIctReplayDiagnosticsJournalEvent,
  buildIctReplayDiagnosticsJournalEvent,
  buildReplayDiagnostics,
  runReplayCalibrationSuite
} from "./ictReplayDiagnostics";
import type { IctReplayResult, IctReplaySummary, IctReplayValidationReport } from "./ictReplayValidationTypes";
import type {
  IctRealReplayAggregateSummary,
  IctRealReplayBucketSummary,
  IctRealReplayRunConfig,
  IctRealReplayRunJournalEvent,
  IctRealReplayRunResult,
  IctRealReplaySymbolResult
} from "./ictRealReplayRunnerTypes";

const REAL_REPLAY_JOURNAL_STORAGE_KEY = "gotrader.ict-real-replay-run-summary.journal.v1";
const MAX_REAL_REPLAY_JOURNAL_EVENTS = 100;

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

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const canonical = (value?: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export interface IctRealReplayFetchedCandles {
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  candles: Candle[];
  candleCount: number;
  connectionStatus: "connected" | "degraded" | "disconnected" | "planned" | "error";
  depthStatus?: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  warnings: string[];
  missingEvidence: string[];
}

export type IctRealReplayCandleFetcher = (request: {
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  limit: number;
}) => Promise<IctRealReplayFetchedCandles>;

export interface IctRealReplayRunOptions {
  fetchCandles?: IctRealReplayCandleFetcher;
  appendJournal?: boolean;
  includeDiagnostics?: boolean;
  includeReplayResults?: boolean;
  newsSessionRiskContext?: IctNewsSessionRiskContextInput;
}

const average = (values: number[]) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);

const sessionForTimestamp = (timestamp?: string) => {
  if (!timestamp) return "unknown";
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off hours";
};

export const defaultIctRealReplayConfig = (): IctRealReplayRunConfig => ({
  requestedSymbols: ["MNQ"],
  primaryTimeframes: ["5m"],
  htfTimeframes: ["15m", "1h"],
  candleLimit: 1000,
  replayWindowSize: 80,
  lookaheadCandles: 12,
  minRequiredCandles: 120,
  researchOnly: true
});

export const resolveIctRealReplaySymbolMapping = (requestedSymbol: string, availableSymbols: string[] = []) => {
  const normalized = canonical(requestedSymbol || "MNQ");
  const mapping =
    mt5ReadOnlyDefaultSymbolMappings.find((candidate) =>
      [candidate.requestedSymbol, candidate.brokerSymbol].map(canonical).includes(normalized)
    ) ?? findDefaultMt5SymbolMapping(requestedSymbol || "MNQ");
  const brokerSymbol = resolveDefaultMt5BrokerSymbol(mapping.requestedSymbol, availableSymbols);
  return {
    requestedSymbol: mapping.requestedSymbol,
    brokerSymbol,
    displayLabel: displayLabelForMt5Mapping({
      brokerSymbol,
      displayLabel: mapping.displayLabel,
      requestedSymbol: mapping.requestedSymbol
    })
  };
};

export const defaultMt5RealReplayCandleFetcher: IctRealReplayCandleFetcher = async ({
  brokerSymbol,
  limit,
  requestedSymbol,
  timeframe
}) => {
  const settings = {
    ...loadMt5ReadOnlySettings(),
    brokerSymbolOverride: brokerSymbol,
    candleLimit: limit,
    requestedSymbol,
    timeframe
  };
  const candlesResponse = await fetchMt5ReadOnlyCandles(
    {
      brokerSymbol,
      limit,
      symbol: requestedSymbol,
      timeframe
    },
    settings
  );
  const feed = createActiveMt5ReadOnlyCandleFeed({
    candlesResponse,
    gotraderSymbol: requestedSymbol,
    gotraderTimeframe: timeframe,
    usageMode: "chart_only"
  });
  return {
    requestedSymbol,
    brokerSymbol: feed.brokerSymbol ?? brokerSymbol,
    timeframe: feed.timeframe,
    candles: mt5ReadOnlyCandlesToGoTraderCandles(feed),
    candleCount: feed.candleCount,
    connectionStatus: feed.connectionStatus,
    depthStatus: feed.depthStatus,
    firstTimestamp: feed.firstTimestamp,
    lastTimestamp: feed.lastTimestamp,
    warnings: feed.warnings,
    missingEvidence: feed.missingEvidence
  };
};

const combineNoTradeReasons = (summaries: IctReplaySummary[]) => {
  const counts = new Map<string, number>();
  summaries.flatMap((summary) => summary.mostCommonNoTradeReasons).forEach(({ count, reason }) => {
    counts.set(reason, (counts.get(reason) ?? 0) + count);
  });
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 10);
};

const bucketSummary = (reports: IctReplayValidationReport[]): IctRealReplayBucketSummary => {
  const summaries = reports.map((report) => report.summary);
  const totalSignals = summaries.reduce((total, summary) => total + summary.totalSignals, 0);
  const targetFirstCount = summaries.reduce((total, summary) => total + summary.targetFirstCount, 0);
  const invalidationFirstCount = summaries.reduce((total, summary) => total + summary.invalidationFirstCount, 0);
  const weightedRr = summaries.reduce((total, summary) => total + summary.averageRrAchieved * summary.totalSignals, 0);
  return {
    totalSignals,
    targetFirstRate: totalSignals ? round(targetFirstCount / totalSignals) : 0,
    invalidationFirstRate: totalSignals ? round(invalidationFirstCount / totalSignals) : 0,
    averageRrAchieved: totalSignals ? round(weightedRr / totalSignals, 2) : 0
  };
};

const buildSessionBuckets = (reports: IctReplayValidationReport[]) => {
  const bySession = new Map<string, IctReplayResult[]>();
  reports.flatMap((report) => report.results).forEach((result) => {
    const session = sessionForTimestamp(result.tradePath.signalTime);
    bySession.set(session, [...(bySession.get(session) ?? []), result]);
  });
  return Object.fromEntries(
    [...bySession.entries()].map(([session, results]) => {
      const totalSignals = results.length;
      const rrValues = results.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number");
      return [
        session,
        {
          totalSignals,
          targetFirstRate: totalSignals ? round(results.filter((result) => result.outcome === "target_first").length / totalSignals) : 0,
          invalidationFirstRate: totalSignals ? round(results.filter((result) => result.outcome === "invalidation_first").length / totalSignals) : 0,
          averageRrAchieved: average(rrValues)
        }
      ];
    })
  );
};

const fetchIndexComparisonCandles = async ({
  candleLimit,
  fetchCandles,
  primary,
  primaryTimeframe
}: {
  candleLimit: number;
  fetchCandles: IctRealReplayCandleFetcher;
  primary: IctRealReplayFetchedCandles;
  primaryTimeframe: string;
}): Promise<IctIndexComparisonCandles> => {
  if (!smtSymbolMatchesIndexGroup(primary.brokerSymbol) && !smtSymbolMatchesIndexGroup(primary.requestedSymbol)) {
    return {};
  }
  const comparison: IctIndexComparisonCandles = {};
  for (const instrument of ICT_INDEX_SMT_INSTRUMENTS) {
    try {
      if (canonical(primary.brokerSymbol) === canonical(instrument.brokerSymbol) && primary.candles.length) {
        comparison[instrument.brokerSymbol] = primary.candles;
        continue;
      }
      const fetched = await fetchCandles({
        requestedSymbol: instrument.requestedSymbol,
        brokerSymbol: instrument.brokerSymbol,
        timeframe: primaryTimeframe,
        limit: candleLimit
      });
      if ((fetched.connectionStatus === "connected" || fetched.connectionStatus === "degraded") && fetched.candles.length) {
        comparison[instrument.brokerSymbol] = fetched.candles;
      }
    } catch {
      // Missing comparison data downgrades SMT to insufficient_data; real replay continues.
    }
  }
  return comparison;
};

const aggregateReports = (
  config: IctRealReplayRunConfig,
  symbols: IctRealReplaySymbolResult[],
  reports: Array<{ requestedSymbol: string; primaryTimeframe: string; report: IctReplayValidationReport }>
): IctRealReplayAggregateSummary => {
  const summaries = reports.map(({ report }) => report.summary);
  const totalSignals = summaries.reduce((total, summary) => total + summary.totalSignals, 0);
  const targetFirstCount = summaries.reduce((total, summary) => total + summary.targetFirstCount, 0);
  const invalidationFirstCount = summaries.reduce((total, summary) => total + summary.invalidationFirstCount, 0);
  const partialTargetCount = summaries.reduce((total, summary) => total + summary.partialTargetCount, 0);
  const stalledCount = summaries.reduce((total, summary) => total + summary.stalledCount, 0);
  const weightedRr = summaries.reduce((total, summary) => total + summary.averageRrAchieved * summary.totalSignals, 0);
  return {
    totalSymbols: config.requestedSymbols.length,
    completedSymbols: symbols.filter((symbol) => symbol.status === "completed").length,
    failedSymbols: symbols.filter((symbol) => symbol.status === "failed").length,
    totalWindows: summaries.reduce((total, summary) => total + summary.totalWindows, 0),
    totalSignals,
    totalNoTrades: summaries.reduce((total, summary) => total + summary.totalNoTrades, 0),
    targetFirstRate: totalSignals ? round(targetFirstCount / totalSignals) : 0,
    invalidationFirstRate: totalSignals ? round(invalidationFirstCount / totalSignals) : 0,
    partialTargetRate: totalSignals ? round(partialTargetCount / totalSignals) : 0,
    stalledRate: totalSignals ? round(stalledCount / totalSignals) : 0,
    insufficientFutureCandlesCount: summaries.reduce((total, summary) => total + summary.insufficientFutureCandlesCount, 0),
    averageRrAchieved: totalSignals ? round(weightedRr / totalSignals, 2) : 0,
    mostCommonNoTradeReasons: combineNoTradeReasons(summaries),
    bySymbol: Object.fromEntries(
      config.requestedSymbols.map((requestedSymbol) => [
        requestedSymbol,
        bucketSummary(reports.filter((item) => item.requestedSymbol === requestedSymbol).map((item) => item.report))
      ])
    ),
    byTimeframe: Object.fromEntries(
      config.primaryTimeframes.map((timeframe) => [
        timeframe,
        bucketSummary(reports.filter((item) => item.primaryTimeframe === timeframe).map((item) => item.report))
      ])
    ),
    bySession: buildSessionBuckets(reports.map((item) => item.report))
  };
};

export const buildIctRealReplayRunJournalEvent = (result: IctRealReplayRunResult): IctRealReplayRunJournalEvent => ({
  eventType: "ict_real_replay_run_summary",
  journalEventId: createId("ict_real_replay_journal"),
  runId: result.runId,
  generatedAt: result.generatedAt,
  requestedSymbols: result.config.requestedSymbols,
  brokerSymbols: result.symbols.map((symbol) => symbol.brokerSymbol),
  primaryTimeframes: result.config.primaryTimeframes,
  htfTimeframes: result.config.htfTimeframes,
  candleLimit: result.config.candleLimit,
  replayWindowSize: result.config.replayWindowSize,
  lookaheadCandles: result.config.lookaheadCandles,
  totalWindows: result.aggregateSummary.totalWindows,
  totalSignals: result.aggregateSummary.totalSignals,
  totalNoTrades: result.aggregateSummary.totalNoTrades,
  targetFirstRate: result.aggregateSummary.targetFirstRate,
  invalidationFirstRate: result.aggregateSummary.invalidationFirstRate,
  averageRrAchieved: result.aggregateSummary.averageRrAchieved,
  mostCommonNoTradeReasons: result.aggregateSummary.mostCommonNoTradeReasons,
  bySymbol: result.aggregateSummary.bySymbol,
  researchOnly: true,
  authority,
  safety
});

export const readIctRealReplayRunJournalEvents = (): IctRealReplayRunJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REAL_REPLAY_JOURNAL_STORAGE_KEY) ?? "[]") as IctRealReplayRunJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_real_replay_run_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctRealReplayRunJournalEvent = (event: IctRealReplayRunJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  }
  const current = readIctRealReplayRunJournalEvents();
  const next = [...current, sanitized].slice(-MAX_REAL_REPLAY_JOURNAL_EVENTS);
  window.localStorage.setItem(REAL_REPLAY_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export async function runIctRealReplay(configInput: Partial<IctRealReplayRunConfig> = {}, options: IctRealReplayRunOptions = {}) {
  const defaults = defaultIctRealReplayConfig();
  const config: IctRealReplayRunConfig = {
    ...defaults,
    ...configInput,
    requestedSymbols: (configInput.requestedSymbols?.length ? configInput.requestedSymbols : defaults.requestedSymbols).map((symbol) => symbol.trim()).filter(Boolean),
    primaryTimeframes: (configInput.primaryTimeframes?.length ? configInput.primaryTimeframes : defaults.primaryTimeframes).map((timeframe) => sanitizeMt5ReadOnlyTimeframe(timeframe)),
    htfTimeframes: sanitizeMt5HigherTimeframes(configInput.htfTimeframes ?? defaults.htfTimeframes),
    candleLimit: Math.max(1, Math.min(5000, Number(configInput.candleLimit ?? defaults.candleLimit))),
    replayWindowSize: Math.max(3, Math.floor(Number(configInput.replayWindowSize ?? defaults.replayWindowSize))),
    lookaheadCandles: Math.max(1, Math.floor(Number(configInput.lookaheadCandles ?? defaults.lookaheadCandles))),
    minRequiredCandles: Math.max(3, Math.floor(Number(configInput.minRequiredCandles ?? defaults.minRequiredCandles))),
    researchOnly: true
  };
  const fetchCandles = options.fetchCandles ?? defaultMt5RealReplayCandleFetcher;
  const symbolResults: IctRealReplaySymbolResult[] = [];
  const completedReports: Array<{ requestedSymbol: string; primaryTimeframe: string; report: IctReplayValidationReport }> = [];
  const replayResults: IctReplayResult[] = [];

  for (const requested of config.requestedSymbols) {
    const mapping = resolveIctRealReplaySymbolMapping(requested);
    for (const primaryTimeframeInput of config.primaryTimeframes) {
      const primaryTimeframe = sanitizeMt5ReadOnlyTimeframe(primaryTimeframeInput) as Timeframe;
      try {
        const primary = await fetchCandles({
          requestedSymbol: mapping.requestedSymbol,
          brokerSymbol: mapping.brokerSymbol,
          timeframe: primaryTimeframe,
          limit: config.candleLimit
        });
        if (
          (primary.connectionStatus !== "connected" && primary.connectionStatus !== "degraded") ||
          primary.candleCount < config.minRequiredCandles
        ) {
          symbolResults.push({
            requestedSymbol: mapping.requestedSymbol,
            brokerSymbol: mapping.brokerSymbol,
            displayLabel: mapping.displayLabel,
            primaryTimeframe,
            htfTimeframes: config.htfTimeframes,
            status: "skipped",
            reason:
              primary.missingEvidence[0] ??
              primary.warnings[0] ??
              `MT5 returned ${primary.candleCount} candle(s), below required ${config.minRequiredCandles}.`
          });
          continue;
        }
        const htfCandles: Record<string, Candle[]> = {};
        for (const htfTimeframe of config.htfTimeframes.filter((timeframe) => timeframe !== primaryTimeframe)) {
          const htf = await fetchCandles({
            requestedSymbol: mapping.requestedSymbol,
            brokerSymbol: mapping.brokerSymbol,
            timeframe: htfTimeframe,
            limit: config.candleLimit
          });
          if ((htf.connectionStatus === "connected" || htf.connectionStatus === "degraded") && htf.candles.length) {
            htfCandles[htfTimeframe] = htf.candles;
          }
        }
        const indexComparisonCandles = await fetchIndexComparisonCandles({
          candleLimit: config.candleLimit,
          fetchCandles,
          primary,
          primaryTimeframe
        });
        const report = sanitizeReplayOutput(
          runIctReplayValidation({
            symbol: mapping.requestedSymbol,
            requestedSymbol: mapping.requestedSymbol,
            brokerSymbol: mapping.brokerSymbol,
            primaryTimeframe,
            htfTimeframes: Object.keys(htfCandles),
            candles: primary.candles,
            htfCandles,
            indexComparisonCandles,
            newsSessionRiskContext: options.newsSessionRiskContext ?? { syntheticNoRisk: true, provider: "historical_replay" },
            replayWindowSize: config.replayWindowSize,
            lookaheadCandles: config.lookaheadCandles,
            researchOnly: true
          })
        );
        completedReports.push({ requestedSymbol: mapping.requestedSymbol, primaryTimeframe, report });
        replayResults.push(...report.results);
        symbolResults.push({
          requestedSymbol: mapping.requestedSymbol,
          brokerSymbol: mapping.brokerSymbol,
          displayLabel: mapping.displayLabel,
          primaryTimeframe,
          htfTimeframes: Object.keys(htfCandles),
          status: "completed",
          summary: report.summary
        });
      } catch (error) {
        symbolResults.push({
          requestedSymbol: mapping.requestedSymbol,
          brokerSymbol: mapping.brokerSymbol,
          displayLabel: mapping.displayLabel,
          primaryTimeframe,
          htfTimeframes: config.htfTimeframes,
          status: "failed",
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const diagnostics = options.includeDiagnostics === false ? undefined : buildReplayDiagnostics(replayResults);
  const calibrationResults = diagnostics ? runReplayCalibrationSuite(replayResults) : undefined;
  const approvedProfileResults = diagnostics ? buildApprovedSetupProfileRunSummaries(replayResults) : undefined;
  const result = sanitizeIctRealReplayRunResult({
    runId: createId("ict_real_replay"),
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    authority,
    config,
    symbols: symbolResults,
    aggregateSummary: aggregateReports(config, symbolResults, completedReports),
    diagnostics,
    calibrationResults,
    approvedProfileResults,
    replayResults: options.includeReplayResults ? replayResults : undefined,
    safety
  });
  if (options.appendJournal !== false) {
    appendIctRealReplayRunJournalEvent(buildIctRealReplayRunJournalEvent(result));
    if (result.diagnostics && result.calibrationResults) {
      appendIctReplayDiagnosticsJournalEvent(
        buildIctReplayDiagnosticsJournalEvent({
          calibrationResults: result.calibrationResults,
          diagnostics: result.diagnostics,
          runId: result.runId
        })
      );
    }
    if (result.approvedProfileResults?.length) {
      appendIctApprovedSetupProfileJournalEvents(
        buildIctApprovedSetupProfileJournalEvents({
          profileSummaries: result.approvedProfileResults,
          runId: result.runId
        })
      );
    }
  }
  return result;
}

export const sanitizeIctRealReplayRunResult = (result: IctRealReplayRunResult): IctRealReplayRunResult => {
  const sanitized = JSON.parse(JSON.stringify(result)) as IctRealReplayRunResult;
  sanitized.researchOnly = true;
  sanitized.authority = authority;
  sanitized.safety = safety;
  sanitized.config.researchOnly = true;
  sanitized.replayResults = sanitized.replayResults?.map((result) => ({ ...result, researchOnly: true as const }));
  return sanitized;
};

export const assertIctRealReplayRunOutputIsCompact = (result: IctRealReplayRunResult) => {
  const { safety: _safety, diagnostics, ...payloadWithoutSafetyLabels } = result;
  const diagnosticsWithoutSafety = diagnostics ? { ...diagnostics, safety: undefined } : undefined;
  const serialized = JSON.stringify(payloadWithoutSafetyLabels);
  const diagnosticsSerialized = JSON.stringify(diagnosticsWithoutSafety ?? {});
  return {
    ok:
      result.researchOnly === true &&
      result.authority.executionAuthority === "none" &&
      result.authority.brokerAuthority === "none" &&
      result.authority.readinessOverrideAuthority === "none" &&
      result.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized + diagnosticsSerialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized + diagnosticsSerialized),
    serializedBytes: new Blob([serialized, diagnosticsSerialized]).size
  };
};
