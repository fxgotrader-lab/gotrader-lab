import type { CanonicalCandleSource, CanonicalCandleSourceSummary } from "../candleSources";
import {
  fetchMt5CandlesInChunks,
  fetchMt5ReadOnlyCandles,
  type Mt5ReadOnlyChunkedHistoryResult
} from "../integrations/mt5/mt5ReadOnlyClient";
import type { Mt5ReadOnlyCandle, Mt5ReadOnlyCandlesResponse } from "../integrations/mt5/mt5ReadOnlyTypes";
import {
  calculateAvailableLookbackDays,
  summarizeHistoryDepth,
  type Mt5ReadOnlyDepthSummary
} from "../integrations/mt5/mt5ReadOnlyDepth";
import type { ResearchRuntimeSnapshot } from "../runtime";
import type { Candle, FuturesSymbol, Timeframe } from "../types";
import type {
  IctAnalysisDepthStatus,
  IctAnalysisTimeframe,
  IctAnalysisTimeframeContext,
  IctAnalysisTimeframeRole,
  IctMarketAnalysisContext,
  IctMarketAnalysisContextBundle,
  IctWeeklyBiasDirection,
  IctWeeklyBiasStatus
} from "./ictMarketAnalysisContextTypes";

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

export const ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES: IctAnalysisTimeframe[] = ["W1", "D1", "H4", "H1", "M15", "M5"];
export const ICT_OPTIONAL_MARKET_ANALYSIS_TIMEFRAMES: IctAnalysisTimeframe[] = ["M1"];
export const ICT_DEFAULT_MARKET_ANALYSIS_LOOKBACK_DAYS = 90;
export const ICT_DEFAULT_CHART_DISPLAY_CANDLE_LIMIT = 1000;

const timeframeRole: Record<IctAnalysisTimeframe, IctAnalysisTimeframeRole> = {
  W1: "weekly_bias",
  D1: "daily_bias",
  H4: "htf_bias",
  H1: "bias_and_dealing_range",
  M15: "session_model",
  M5: "confirmation_refinement",
  M1: "entry_refinement"
};

const requestTimeframe: Record<IctAnalysisTimeframe, string> = {
  W1: "1w",
  D1: "1d",
  H4: "4h",
  H1: "1h",
  M15: "15m",
  M5: "5m",
  M1: "1m"
};

const candleTimeframe: Record<IctAnalysisTimeframe, Timeframe> = {
  W1: "1d",
  D1: "1d",
  H4: "4h",
  H1: "1h",
  M15: "15m",
  M5: "5m",
  M1: "1m"
};

const chunkDaysFor: Record<IctAnalysisTimeframe, number> = {
  W1: 90,
  D1: 90,
  H4: 30,
  H1: 30,
  M15: 10,
  M5: 10,
  M1: 5
};

const futuresSymbols = new Set<FuturesSymbol>(["ES", "NQ", "MES", "MNQ", "YM", "XAUUSD", "EURUSD", "BTCUSD"]);

const toFuturesSymbol = (value?: string): FuturesSymbol => {
  const normalized = String(value ?? "MNQ").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return futuresSymbols.has(normalized as FuturesSymbol) ? (normalized as FuturesSymbol) : "MNQ";
};

export const ictAnalysisTimeframeFromTimeframe = (timeframe?: string): IctAnalysisTimeframe | undefined => {
  const normalized = String(timeframe ?? "").trim().toLowerCase();
  if (["w1", "1w", "weekly", "week"].includes(normalized)) return "W1";
  if (["d1", "1d", "daily", "day"].includes(normalized)) return "D1";
  if (["h4", "4h", "240m"].includes(normalized)) return "H4";
  if (["h1", "1h", "60m"].includes(normalized)) return "H1";
  if (["m15", "15m"].includes(normalized)) return "M15";
  if (["m5", "5m"].includes(normalized)) return "M5";
  if (["m1", "1m"].includes(normalized)) return "M1";
  return undefined;
};

const compactDepthStatus = (status?: string): IctAnalysisDepthStatus => {
  if (status === "sufficient") return "sufficient";
  if (status === "limited") return "limited";
  if (status === "insufficient") return "insufficient";
  return "unavailable";
};

const aggregateDepthStatus = (contexts: IctAnalysisTimeframeContext[], missing: IctAnalysisTimeframe[]): IctAnalysisDepthStatus => {
  const required = ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES;
  if (!contexts.length || missing.length === required.length) return "unavailable";
  const contextByTimeframe = new Map(contexts.map((context) => [context.timeframe, context]));
  const allRequiredSufficient = required.every(
    (timeframe) => contextByTimeframe.get(timeframe)?.dataDepthStatus === "sufficient"
  );
  if (allRequiredSufficient) return "sufficient";
  const requiredCoreAvailable = ["M15", "M5", "H1"].every((timeframe) => {
    const status = contextByTimeframe.get(timeframe as IctAnalysisTimeframe)?.dataDepthStatus;
    return status === "sufficient" || status === "limited";
  });
  if (requiredCoreAvailable) return "limited";
  return contexts.some((context) => context.candleCount > 0) ? "insufficient" : "unavailable";
};

const warningFor = (summary: Mt5ReadOnlyDepthSummary) =>
  summary.limitationReason ??
  summary.missingEvidence[0] ??
  (summary.dataDepthStatus === "sufficient" ? undefined : summary.warnings[0]);

const contextFromDepthSummary = (
  timeframe: IctAnalysisTimeframe,
  summary: Mt5ReadOnlyDepthSummary,
  sourceMethod: string
): IctAnalysisTimeframeContext => ({
  timeframe,
  requestedLookbackDays: summary.requestedLookbackDays,
  availableLookbackDays: summary.availableLookbackDays,
  candleCount: summary.candleCount,
  dataDepthStatus: compactDepthStatus(summary.dataDepthStatus),
  sourceMethod,
  role: timeframeRole[timeframe],
  firstTimestamp: summary.firstTimestamp,
  lastTimestamp: summary.lastTimestamp,
  chunkCount: summary.chunkCount,
  warning: warningFor(summary)
});

const sourceFirstLast = (source?: Pick<CanonicalCandleSourceSummary | CanonicalCandleSource, "firstTimestamp" | "lastTimestamp">) => ({
  firstTimestamp: source?.firstTimestamp,
  lastTimestamp: source?.lastTimestamp
});

const weeklyBiasFromCandles = (candles: Candle[] = []): {
  weeklyBiasStatus: IctWeeklyBiasStatus;
  weeklyBiasDirection: IctWeeklyBiasDirection;
  weeklyBiasReason: string;
} => {
  const ordered = candles
    .filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.close))
    .slice()
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  if (!ordered.length) {
    return {
      weeklyBiasStatus: "unavailable",
      weeklyBiasDirection: "unknown",
      weeklyBiasReason: "W1 context unavailable from MT5 range endpoint."
    };
  }
  if (ordered.length < 2) {
    return {
      weeklyBiasStatus: "insufficient_data",
      weeklyBiasDirection: "unknown",
      weeklyBiasReason: `Only ${ordered.length} W1 candle available; weekly bias needs at least two compact weekly candles.`
    };
  }
  const previous = ordered.at(-2);
  const latest = ordered.at(-1);
  if (!previous || !latest) {
    return {
      weeklyBiasStatus: "insufficient_data",
      weeklyBiasDirection: "unknown",
      weeklyBiasReason: "W1 context did not contain enough ordered candles for compact weekly bias."
    };
  }
  const bodyDirection =
    latest.close > latest.open ? "bullish" : latest.close < latest.open ? "bearish" : "neutral";
  const closeDirection =
    latest.close > previous.close ? "bullish" : latest.close < previous.close ? "bearish" : "neutral";
  const weeklyBiasDirection =
    bodyDirection === closeDirection ? bodyDirection : closeDirection === "neutral" ? bodyDirection : "neutral";
  return {
    weeklyBiasStatus: "loaded",
    weeklyBiasDirection,
    weeklyBiasReason: `W1 compact bias loaded from ${ordered.length} candles; latest close ${latest.close} versus prior close ${previous.close}.`
  };
};

const summaryFromSource = ({
  brokerSymbol,
  requestedLookbackDays,
  requestedSymbol,
  source,
  timeframe
}: {
  brokerSymbol: string;
  requestedLookbackDays: number;
  requestedSymbol: string;
  source?: Pick<CanonicalCandleSourceSummary | CanonicalCandleSource, "candleCount" | "firstTimestamp" | "lastTimestamp" | "timeframe">;
  timeframe: IctAnalysisTimeframe;
}): Mt5ReadOnlyDepthSummary => {
  const firstLast = sourceFirstLast(source);
  const availableLookbackDays = calculateAvailableLookbackDays(firstLast);
  const candleCount = source?.candleCount ?? 0;
  const dataDepthStatus = candleCount
    ? availableLookbackDays >= requestedLookbackDays * 0.8
      ? "sufficient"
      : availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)
        ? "limited"
        : "insufficient"
    : "unavailable";
  return {
    provider: "mt5_read_only",
    requestedSymbol,
    brokerSymbol,
    timeframe: requestTimeframe[timeframe],
    requestedLookbackDays,
    availableLookbackDays,
    returnedCount: candleCount,
    candleCount,
    chunkCount: 0,
    firstTimestamp: firstLast.firstTimestamp,
    lastTimestamp: firstLast.lastTimestamp,
    firstCandleTime: firstLast.firstTimestamp,
    lastCandleTime: firstLast.lastTimestamp,
    depthStatus: dataDepthStatus,
    dataDepthStatus,
    chunkingStatus: "single_window",
    limitationReason: dataDepthStatus === "sufficient" ? undefined : "Only the lightweight active/registered candle window is available. Click Activate Market to request explicit 90-day multi-timeframe context.",
    warnings: [
      "Lightweight advisor packet did not fetch deep history on page load.",
      dataDepthStatus === "sufficient" ? "Current registered window is sufficient." : "Explicit Activate Market is required for full 90-day context."
    ],
    missingEvidence: dataDepthStatus === "sufficient" ? [] : ["90-day multi-timeframe analysis context has not been built for this view."],
    authority,
    safety: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false
    }
  };
};

const mt5CandlesToGoTraderCandles = ({
  candles,
  requestedSymbol,
  timeframe
}: {
  candles: Mt5ReadOnlyCandle[];
  requestedSymbol: string;
  timeframe: IctAnalysisTimeframe;
}): Candle[] =>
  candles.map((candle, index) => ({
    id: candle.id || `mt5_read_only_${requestedSymbol}_${timeframe}_${candle.time}_${index}`,
    symbol: toFuturesSymbol(requestedSymbol),
    timeframe: candleTimeframe[timeframe],
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? candle.tickVolume
  }));

const mt5DisplayCandlesToGoTraderCandles = ({
  candles,
  requestedSymbol,
  timeframe
}: {
  candles: Mt5ReadOnlyCandlesResponse["candles"];
  requestedSymbol: string;
  timeframe: string;
}): Candle[] =>
  candles.map((candle, index) => ({
    id: candle.id || `mt5_read_only_display_${requestedSymbol}_${timeframe}_${candle.time}_${index}`,
    symbol: toFuturesSymbol(requestedSymbol),
    timeframe: (["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(timeframe) ? timeframe : "5m") as Timeframe,
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? candle.tickVolume
  }));

const buildContext = ({
  analysisContexts,
  brokerSymbol,
  chartDisplayCandleCount,
  displayTimeframe,
  requestedSymbol,
  weeklyBias,
  warnings
}: {
  analysisContexts: IctAnalysisTimeframeContext[];
  brokerSymbol: string;
  chartDisplayCandleCount: number;
  displayTimeframe: string;
  requestedSymbol: string;
  weeklyBias?: {
    weeklyBiasStatus: IctWeeklyBiasStatus;
    weeklyBiasDirection: IctWeeklyBiasDirection;
    weeklyBiasReason: string;
  };
  warnings: string[];
}): IctMarketAnalysisContext => {
  const used = ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES.filter((timeframe) =>
    analysisContexts.some((context) => context.timeframe === timeframe && context.candleCount > 0)
  );
  const missing = ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES.filter((timeframe) => !used.includes(timeframe));
  const requiredTimeframesLoaded = used.includes("M5") && used.includes("M15");
  const multiTimeframeContextStatus = requiredTimeframesLoaded
    ? missing.length ? "partial" : "built"
    : used.length ? "partial" : "unavailable";
  const htfBiasSource = used.filter((timeframe) => ["W1", "D1", "H4", "H1"].includes(timeframe));
  const sessionModelSourceTimeframe = used.includes("M15") ? "M15" : used.includes("M5") ? "M5" : undefined;
  const weeklyContext = analysisContexts.find((context) => context.timeframe === "W1");
  const weeklyFallback = weeklyBias ?? (
    weeklyContext?.candleCount
      ? {
          weeklyBiasStatus: "loaded" as const,
          weeklyBiasDirection: "unknown" as const,
          weeklyBiasReason: "W1 context is registered; compact weekly direction requires explicit Activate Market context."
        }
      : {
          weeklyBiasStatus: "unavailable" as const,
          weeklyBiasDirection: "unknown" as const,
          weeklyBiasReason: weeklyContext?.warning ?? "W1 context unavailable from MT5 range endpoint."
        }
  );
  return {
    researchOnly: true,
    requestedSymbol,
    brokerSymbol,
    displayTimeframe,
    displayTimeframeRole: "chart_display_reference_only",
    analysisTimeframesRequested: [...ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES],
    analysisTimeframes: ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES.map((timeframe) =>
      analysisContexts.find((context) => context.timeframe === timeframe) ?? {
        timeframe,
        requestedLookbackDays: ICT_DEFAULT_MARKET_ANALYSIS_LOOKBACK_DAYS,
        availableLookbackDays: 0,
        candleCount: 0,
        dataDepthStatus: "unavailable" as const,
        sourceMethod: "not_requested_or_unavailable",
        role: timeframeRole[timeframe],
        warning: "Timeframe context is missing."
      }
    ),
    analysisTimeframesLoaded: used,
    requiredTimeframesLoaded,
    chartDisplayCandleCount,
    analysisDepthStatus: aggregateDepthStatus(analysisContexts, missing),
    multiTimeframeContextStatus,
    analysisTimeframesUsed: used,
    missingTimeframes: missing,
    htfBiasSource,
    sessionModelSourceTimeframe,
    confirmationSourceTimeframe: used.includes("M5") ? "M5" : undefined,
    weeklyBiasStatus: weeklyFallback.weeklyBiasStatus,
    weeklyBiasDirection: weeklyFallback.weeklyBiasDirection,
    weeklyBiasReason: weeklyFallback.weeklyBiasReason,
    warnings: Array.from(new Set([
      ...warnings,
      missing.length ? `Missing analysis timeframes: ${missing.join(", ")}.` : undefined,
      multiTimeframeContextStatus === "partial" ? "Multi-timeframe context is partial but built from available compact analysis frames." : undefined,
      "Selected chart timeframe is display/reference only; it is not the sole analysis timeframe.",
      "MT5 USTECH is read-only CFD/proxy data for MNQ/NQ research, not CME futures broker truth."
    ].filter((value): value is string => Boolean(value)))),
    generatedAt: new Date().toISOString(),
    authority,
    safety
  };
};

const resolveRequestedSymbol = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.marketData.symbol ?? snapshot.marketData.activeResearchSource.symbol ?? "MNQ";

const resolveBrokerSymbol = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.mt5ReadOnly.brokerSymbol ??
  snapshot.marketData.activeResearchSource.provenance?.providerSymbol ??
  snapshot.marketData.contract ??
  resolveRequestedSymbol(snapshot);

const resolveDisplayTimeframe = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.marketData.activeResearchSource.timeframe ?? snapshot.marketData.timeframe ?? "5m";

export const buildIctMarketAnalysisContextFromSnapshot = ({
  activeSource,
  snapshot
}: {
  activeSource?: CanonicalCandleSource;
  snapshot: ResearchRuntimeSnapshot;
}): IctMarketAnalysisContext => {
  const requestedSymbol = resolveRequestedSymbol(snapshot);
  const brokerSymbol = resolveBrokerSymbol(snapshot);
  const displayTimeframe = resolveDisplayTimeframe(snapshot);
  const summaries = new Map<IctAnalysisTimeframe, Pick<CanonicalCandleSourceSummary | CanonicalCandleSource, "candleCount" | "firstTimestamp" | "lastTimestamp" | "timeframe">>();
  const activeTimeframe = ictAnalysisTimeframeFromTimeframe(activeSource?.timeframe ?? snapshot.marketData.activeResearchSource.timeframe);
  if (activeTimeframe) summaries.set(activeTimeframe, activeSource ?? snapshot.marketData.activeResearchSource);
  for (const source of snapshot.mt5ReadOnly.higherTimeframeSources ?? []) {
    const timeframe = ictAnalysisTimeframeFromTimeframe(source.timeframe);
    if (timeframe) summaries.set(timeframe, source);
  }
  const contexts = [...summaries.entries()].map(([timeframe, source]) =>
    contextFromDepthSummary(
      timeframe,
      summaryFromSource({
        brokerSymbol,
        requestedLookbackDays: ICT_DEFAULT_MARKET_ANALYSIS_LOOKBACK_DAYS,
        requestedSymbol,
        source,
        timeframe
      }),
      "lightweight_registered_source_summary"
    )
  );
  return buildContext({
    analysisContexts: contexts,
    brokerSymbol,
    chartDisplayCandleCount: snapshot.marketData.chartDisplayCandleCount ?? snapshot.marketData.activeResearchSource.candleCount ?? 0,
    displayTimeframe,
    requestedSymbol,
    weeklyBias: undefined,
    warnings: ["Page-load Advisor context is lightweight; deep 90-day fetch runs only when Activate Market is clicked."]
  });
};

export interface BuildIctMarketAnalysisContextConfig {
  brokerSymbol?: string;
  chartDisplayLimit?: number;
  displayTimeframe?: string;
  includeOptionalTimeframes?: IctAnalysisTimeframe[];
  lookbackDays?: number;
  requestedSymbol?: string;
  snapshot?: ResearchRuntimeSnapshot;
  timeframes?: IctAnalysisTimeframe[];
  to?: string;
}

export interface BuildIctMarketAnalysisContextDependencies {
  fetchDisplayCandles?: typeof fetchMt5ReadOnlyCandles;
  fetchChunkedHistory?: typeof fetchMt5CandlesInChunks;
}

export async function buildIctMarketAnalysisContextBundle(
  config: BuildIctMarketAnalysisContextConfig,
  dependencies: BuildIctMarketAnalysisContextDependencies = {}
): Promise<IctMarketAnalysisContextBundle> {
  const snapshot = config.snapshot;
  const requestedSymbol = config.requestedSymbol ?? (snapshot ? resolveRequestedSymbol(snapshot) : "MNQ");
  const brokerSymbol = config.brokerSymbol ?? (snapshot ? resolveBrokerSymbol(snapshot) : "USTECH");
  const displayTimeframe = config.displayTimeframe ?? (snapshot ? resolveDisplayTimeframe(snapshot) : "5m");
  const chartDisplayLimit = Math.max(1, Math.min(1000, config.chartDisplayLimit ?? ICT_DEFAULT_CHART_DISPLAY_CANDLE_LIMIT));
  const lookbackDays = Math.max(1, config.lookbackDays ?? ICT_DEFAULT_MARKET_ANALYSIS_LOOKBACK_DAYS);
  const timeframes = config.timeframes ?? [
    ...ICT_REQUIRED_MARKET_ANALYSIS_TIMEFRAMES,
    ...(config.includeOptionalTimeframes ?? [])
  ];
  const fetchDisplay = dependencies.fetchDisplayCandles ?? fetchMt5ReadOnlyCandles;
  const fetchHistory = dependencies.fetchChunkedHistory ?? fetchMt5CandlesInChunks;
  const warnings: string[] = [];
  let displayCandles: Candle[] = [];
  try {
    const displayResponse = await fetchDisplay({
      brokerSymbol,
      limit: chartDisplayLimit,
      symbol: requestedSymbol,
      timeframe: displayTimeframe
    });
    displayCandles = mt5DisplayCandlesToGoTraderCandles({
      candles: displayResponse.candles.slice(-chartDisplayLimit),
      requestedSymbol,
      timeframe: displayTimeframe
    });
    warnings.push(...displayResponse.warnings.filter((warning) => /read-only|cfd|proxy|unavailable/i.test(warning)).slice(0, 3));
  } catch (error) {
    warnings.push(`Display candle fetch failed: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const analysisCandlesByTimeframe: IctMarketAnalysisContextBundle["analysisCandlesByTimeframe"] = {};
  const depthSummariesByTimeframe: IctMarketAnalysisContextBundle["depthSummariesByTimeframe"] = {};
  const analysisContexts: IctAnalysisTimeframeContext[] = [];
  for (const timeframe of timeframes) {
    try {
      const result = await fetchHistory({
        brokerSymbol,
        chunkDays: chunkDaysFor[timeframe],
        limitPerChunk: 5000,
        lookbackDays,
        symbol: requestedSymbol,
        timeframe: requestTimeframe[timeframe],
        to: config.to
      });
      analysisCandlesByTimeframe[timeframe] = mt5CandlesToGoTraderCandles({
        candles: result.candles,
        requestedSymbol,
        timeframe
      });
      depthSummariesByTimeframe[timeframe] = result.summary;
      analysisContexts.push(contextFromDepthSummary(timeframe, result.summary, sourceMethodFor(result, timeframe)));
    } catch (error) {
      const summary = summarizeHistoryDepth({
        brokerSymbol,
        candles: [],
        chunkCount: 0,
        chunkingStatus: "unavailable",
        limitationReason: error instanceof Error ? error.message : String(error),
        requestedLookbackDays: lookbackDays,
        requestedSymbol,
        timeframe: requestTimeframe[timeframe]
      });
      depthSummariesByTimeframe[timeframe] = summary;
      analysisContexts.push(contextFromDepthSummary(timeframe, summary, "mt5_chunked_range_unavailable"));
    }
  }
  const weeklyBias = weeklyBiasFromCandles(analysisCandlesByTimeframe.W1 ?? []);

  return {
    context: buildContext({
      analysisContexts,
      brokerSymbol,
      chartDisplayCandleCount: displayCandles.length,
      displayTimeframe,
      requestedSymbol,
      weeklyBias,
      warnings
    }),
    displayCandles,
    analysisCandlesByTimeframe,
    depthSummariesByTimeframe
  };
}

export async function buildIctMarketAnalysisContext(
  config: BuildIctMarketAnalysisContextConfig,
  dependencies: BuildIctMarketAnalysisContextDependencies = {}
): Promise<IctMarketAnalysisContext> {
  return (await buildIctMarketAnalysisContextBundle(config, dependencies)).context;
}

function sourceMethodFor(result: Mt5ReadOnlyChunkedHistoryResult, timeframe: IctAnalysisTimeframe) {
  const chunkMethod = result.chunks.find((chunk) => chunk.sourceMethod)?.sourceMethod;
  return chunkMethod ? `chunked:${requestTimeframe[timeframe]}:${chunkMethod}` : `chunked:${requestTimeframe[timeframe]}`;
}

export const assertIctMarketAnalysisContextIsCompact = (context: IctMarketAnalysisContext) => {
  const serialized = JSON.stringify(context);
  return {
    ok:
      context.researchOnly === true &&
      context.authority.executionAuthority === "none" &&
      context.authority.brokerAuthority === "none" &&
      context.authority.readinessOverrideAuthority === "none" &&
      context.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
