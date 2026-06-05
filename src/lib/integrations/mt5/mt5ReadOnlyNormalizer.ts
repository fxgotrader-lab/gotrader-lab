import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";
import type {
  ActiveMt5ReadOnlyCandleFeed,
  Mt5ReadOnlyCandle,
  Mt5ReadOnlyCandlesResponse,
  Mt5ReadOnlyFeedUsageMode,
  Mt5ReadOnlyResearchEligibility
} from "@/lib/integrations/mt5/mt5ReadOnlyTypes";

const futuresSymbols = new Set<FuturesSymbol>(["ES", "NQ", "MES", "MNQ", "YM", "XAUUSD", "EURUSD", "BTCUSD"]);
const timeframeValues = new Set<Timeframe>(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

export const mt5ReadOnlyCandleMinimums = {
  visual: 5,
  quickAnalysis: 100,
  researchCycle: 400,
  walkForward: 1000
} as const;

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const symbolAliases: Record<string, string[]> = {
  MNQ: ["MNQ", "MNQ.Z", "MNQM", "MICRO NASDAQ", "MICRO NASDAQ 100", "NAS100", "US100", "USTEC", "USTECH"],
  NQ: ["NQ", "NAS100", "US100", "USTEC", "USTECH", "NASDAQ", "NASDAQ100"],
  ES: ["ES", "SPX500", "US500", "SP500", "S&P500"],
  YM: ["YM", "US30", "DJ30", "DOW", "DOW30"],
  XAUUSD: ["XAUUSD", "GOLD", "XAU/USD"],
  EURUSD: ["EURUSD", "EUR/USD", "EURUSD.PRO"],
  GBPUSD: ["GBPUSD", "GBP/USD"],
  USDJPY: ["USDJPY", "USD/JPY"],
  BTCUSD: ["BTCUSD", "BTC/USD"]
};

const timeframeAliases: Record<string, string[]> = {
  "1m": ["1", "1m", "m1", "1min"],
  "5m": ["5", "5m", "m5", "5min"],
  "15m": ["15", "15m", "m15", "15min"],
  "30m": ["30", "30m", "m30", "30min"],
  "1h": ["60", "1h", "h1", "60m"],
  "4h": ["240", "4h", "h4", "240m"],
  "1d": ["D", "1D", "1d", "d1"]
};

const canonical = (value?: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const aliasesFor = (symbol?: string) => {
  const normalized = canonical(symbol);
  const key = Object.keys(symbolAliases).find((candidate) =>
    [candidate, ...symbolAliases[candidate]].map(canonical).includes(normalized)
  );
  return new Set([normalized, ...(key ? symbolAliases[key] : []), symbol ?? ""].map(canonical));
};

export const resolveMt5ReadOnlySymbolMatch = ({
  brokerSymbol,
  gotraderSymbol,
  gotraderTimeframe,
  requestedTimeframe
}: {
  brokerSymbol?: string;
  gotraderSymbol?: string;
  gotraderTimeframe?: string;
  requestedTimeframe?: string;
}): { state: ActiveMt5ReadOnlyCandleFeed["matchState"]; reason: string } => {
  if (!gotraderSymbol || !brokerSymbol) {
    return { state: "unavailable", reason: "GoTrader symbol or MT5 broker symbol is unavailable." };
  }

  const gotraderAliases = aliasesFor(gotraderSymbol);
  const brokerCanonical = canonical(brokerSymbol);
  const exact = canonical(gotraderSymbol) === brokerCanonical;
  const equivalent = gotraderAliases.has(brokerCanonical);
  if (!exact && !equivalent) {
    return {
      state: "symbol_mismatch",
      reason: `MT5 broker symbol ${brokerSymbol} does not match GoTrader symbol ${gotraderSymbol}. Use the broker-symbol override if needed.`
    };
  }

  const expected = timeframeAliases[gotraderTimeframe ?? ""] ?? [gotraderTimeframe ?? ""];
  const actual = String(requestedTimeframe ?? "").trim();
  if (gotraderTimeframe && actual && !expected.map((item) => item.toLowerCase()).includes(actual.toLowerCase())) {
    return {
      state: "timeframe_mismatch",
      reason: `MT5 timeframe ${actual} does not match GoTrader timeframe ${gotraderTimeframe}.`
    };
  }

  return exact
    ? { state: "exact_match", reason: "MT5 broker symbol and timeframe match GoTrader selection." }
    : { state: "equivalent_symbol", reason: "MT5 broker symbol is equivalent to the GoTrader symbol alias." };
};

const validNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const parseTimestamp = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return undefined;
};

export const normalizeMt5ReadOnlyResponseCandles = (
  response: Mt5ReadOnlyCandlesResponse,
  limit = response.requestedLimit
): Mt5ReadOnlyCandle[] => {
  const seen = new Set<number>();
  return response.candles
    .map((raw, index) => {
      const timestamp = parseTimestamp(raw.timestamp ?? raw.time);
      const time = timestamp ? Math.floor(Date.parse(timestamp) / 1000) : Number(raw.time);
      return {
        id: raw.id || `mt5_read_only_${response.symbol}_${response.timeframe}_${timestamp ?? index}`,
        time,
        timestamp: timestamp ?? raw.timestamp,
        open: Number(raw.open),
        high: Number(raw.high),
        low: Number(raw.low),
        close: Number(raw.close),
        volume: validNumber(raw.volume) ? raw.volume : undefined,
        tickVolume: validNumber(raw.tickVolume) ? raw.tickVolume : undefined,
        spread: validNumber(raw.spread) ? raw.spread : undefined,
        source: "mt5_read_only" as const,
        symbol: response.symbol,
        timeframe: response.timeframe
      };
    })
    .filter((candle) =>
      validNumber(candle.time) &&
      validNumber(candle.open) &&
      validNumber(candle.high) &&
      validNumber(candle.low) &&
      validNumber(candle.close) &&
      Boolean(candle.timestamp)
    )
    .sort((a, b) => a.time - b.time)
    .filter((candle) => {
      if (seen.has(candle.time)) {
        return false;
      }
      seen.add(candle.time);
      return true;
    })
    .slice(-Math.max(1, Math.min(5000, limit)));
};

const monotonic = (candles: Mt5ReadOnlyCandle[]) =>
  candles.every((candle, index) => index === 0 || candle.time > candles[index - 1].time);

export const buildMt5ReadOnlyCandleFingerprint = (candles: Pick<Mt5ReadOnlyCandle, "close" | "timestamp">[]) => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) {
    return "empty";
  }
  return [
    candles.length,
    first.timestamp,
    Number(first.close).toFixed(8),
    last.timestamp,
    Number(last.close).toFixed(8)
  ].join("|");
};

export const evaluateMt5ReadOnlyResearchEligibility = ({
  candles,
  connectionStatus,
  matchState,
  sourceLabel
}: {
  candles: Mt5ReadOnlyCandle[];
  connectionStatus: Mt5ReadOnlyCandlesResponse["connectionStatus"];
  matchState: ActiveMt5ReadOnlyCandleFeed["matchState"];
  sourceLabel: string;
}): Mt5ReadOnlyResearchEligibility => {
  const candleCount = candles.length;
  const connected = connectionStatus === "connected" || connectionStatus === "degraded";
  const visualEligible = connected && candleCount >= mt5ReadOnlyCandleMinimums.visual;
  const symbolMatch = matchState === "exact_match" || matchState === "equivalent_symbol" || matchState === "timeframe_mismatch";
  const timeframeMatch = matchState === "exact_match" || matchState === "equivalent_symbol";
  const monotonicTimestamps = monotonic(candles);
  const explicitlyReadOnly = sourceLabel.toLowerCase().includes("read-only") || sourceLabel.toLowerCase().includes("read only");
  const quickAnalysisEligible =
    visualEligible &&
    symbolMatch &&
    timeframeMatch &&
    monotonicTimestamps &&
    explicitlyReadOnly &&
    candleCount >= mt5ReadOnlyCandleMinimums.quickAnalysis;
  const researchCycleEligible = quickAnalysisEligible && candleCount >= mt5ReadOnlyCandleMinimums.researchCycle;
  const walkForwardEligible = quickAnalysisEligible && candleCount >= mt5ReadOnlyCandleMinimums.walkForward;
  const reasons: string[] = [];

  if (!connected) {
    reasons.push("MT5 read-only bridge is disconnected or returned no candle series.");
  }
  if (candleCount < mt5ReadOnlyCandleMinimums.visual) {
    reasons.push(`At least ${mt5ReadOnlyCandleMinimums.visual} candles are required for visual display.`);
  }
  if (!symbolMatch) {
    reasons.push("MT5 broker symbol does not match the active GoTrader symbol or recognized alias.");
  }
  if (!timeframeMatch && symbolMatch) {
    reasons.push("MT5 candle timeframe does not match the selected GoTrader timeframe.");
  }
  if (!monotonicTimestamps) {
    reasons.push("MT5 candles do not have valid monotonic timestamps.");
  }
  if (!explicitlyReadOnly) {
    reasons.push("MT5 source must be explicitly marked read-only.");
  }
  if (visualEligible && candleCount < mt5ReadOnlyCandleMinimums.quickAnalysis) {
    reasons.push(`Visual-only: quick analysis requires at least ${mt5ReadOnlyCandleMinimums.quickAnalysis} candles.`);
  } else if (quickAnalysisEligible && candleCount < mt5ReadOnlyCandleMinimums.researchCycle) {
    reasons.push(`Analysis only: research cycle requires at least ${mt5ReadOnlyCandleMinimums.researchCycle} candles.`);
  }
  if (researchCycleEligible && candleCount < mt5ReadOnlyCandleMinimums.walkForward) {
    reasons.push(`Walk-forward requires more depth; target at least ${mt5ReadOnlyCandleMinimums.walkForward} candles.`);
  }

  const state = !connected
    ? "ineligible_disconnected"
    : candleCount < mt5ReadOnlyCandleMinimums.visual
      ? "ineligible_low_candle_count"
      : !monotonicTimestamps
        ? "invalid_candles"
        : !symbolMatch
          ? "ineligible_symbol_mismatch"
          : !timeframeMatch
            ? "ineligible_timeframe_mismatch"
            : researchCycleEligible
              ? "eligible_for_research_cycle"
              : quickAnalysisEligible
                ? "eligible_for_analysis"
                : "visual_only";

  return {
    state,
    reasons: reasons.length ? reasons : ["MT5 read-only candles satisfy the current eligibility gate."],
    visualEligible,
    quickAnalysisEligible,
    researchCycleEligible,
    walkForwardEligible,
    symbolMatch,
    timeframeMatch,
    monotonicTimestamps,
    candleCount,
    minimumVisualCandles: mt5ReadOnlyCandleMinimums.visual,
    minimumQuickAnalysisCandles: mt5ReadOnlyCandleMinimums.quickAnalysis,
    minimumResearchCycleCandles: mt5ReadOnlyCandleMinimums.researchCycle,
    minimumWalkForwardCandles: mt5ReadOnlyCandleMinimums.walkForward
  };
};

const toFuturesSymbol = (symbol?: string): FuturesSymbol => {
  const normalized = canonical(symbol);
  if (futuresSymbols.has(normalized as FuturesSymbol)) {
    return normalized as FuturesSymbol;
  }
  if (["NAS100", "US100", "USTEC", "USTECH", "NASDAQ", "NASDAQ100"].includes(normalized)) {
    return "NQ";
  }
  if (["SPX500", "US500", "SP500", "S&P500"].map(canonical).includes(normalized)) {
    return "ES";
  }
  if (["US30", "DJ30", "DOW", "DOW30"].map(canonical).includes(normalized)) {
    return "YM";
  }
  if (["XAUUSD", "GOLD", "XAU/USD"].map(canonical).includes(normalized)) {
    return "XAUUSD";
  }
  if (["EURUSD", "EUR/USD", "EURUSDPRO"].map(canonical).includes(normalized)) {
    return "EURUSD";
  }
  if (["BTCUSD", "BTC/USD"].map(canonical).includes(normalized)) {
    return "BTCUSD";
  }
  return "MNQ";
};

const toTimeframe = (timeframe?: string): Timeframe =>
  timeframeValues.has(timeframe as Timeframe) ? (timeframe as Timeframe) : "5m";

export const mt5ReadOnlyCandlesToGoTraderCandles = (
  feed?: Pick<ActiveMt5ReadOnlyCandleFeed, "candles" | "symbol" | "timeframe" | "brokerSymbol"> | null
): Candle[] => {
  if (!feed) {
    return [];
  }
  const symbol = toFuturesSymbol(feed.symbol);
  const timeframe = toTimeframe(feed.timeframe);
  return feed.candles.map((candle, index) => ({
    id: candle.id || `mt5_read_only_${feed.symbol}_${candle.time}_${index}`,
    symbol,
    timeframe,
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? candle.tickVolume
  }));
};

export const createActiveMt5ReadOnlyCandleFeed = ({
  candlesResponse,
  gotraderSymbol,
  gotraderTimeframe,
  latestQuote,
  usageMode = "chart_only"
}: {
  candlesResponse: Mt5ReadOnlyCandlesResponse;
  gotraderSymbol?: string;
  gotraderTimeframe?: string;
  latestQuote?: ActiveMt5ReadOnlyCandleFeed["latestQuote"];
  usageMode?: Mt5ReadOnlyFeedUsageMode;
}): ActiveMt5ReadOnlyCandleFeed => {
  const candles = normalizeMt5ReadOnlyResponseCandles(candlesResponse);
  const latest = candles[candles.length - 1];
  const fetchedAt = new Date().toISOString();
  const sourceLabel = "MT5 read-only candle feed - no execution authority";
  const match = resolveMt5ReadOnlySymbolMatch({
    brokerSymbol: candlesResponse.brokerSymbol ?? candlesResponse.symbol,
    gotraderSymbol,
    gotraderTimeframe,
    requestedTimeframe: candlesResponse.requestedTimeframe ?? candlesResponse.timeframe
  });
  const eligibility = evaluateMt5ReadOnlyResearchEligibility({
    candles,
    connectionStatus: candlesResponse.connectionStatus,
    matchState: match.state,
    sourceLabel
  });
  const activeForResearch = usageMode === "research_source" && eligibility.state === "eligible_for_research_cycle";
  return {
    feedId: `mt5_read_only_feed_${candlesResponse.requestedSymbol}_${candlesResponse.requestedTimeframe}_${Date.now().toString(36)}`,
    provider: "mt5_read_only",
    dataMode: "mt5_read_only",
    activeForChart: candles.length > 0,
    activeForResearch,
    symbol: gotraderSymbol ?? candlesResponse.requestedSymbol,
    requestedSymbol: candlesResponse.requestedSymbol,
    brokerSymbol: candlesResponse.brokerSymbol ?? candlesResponse.symbol,
    timeframe: gotraderTimeframe ?? candlesResponse.timeframe ?? candlesResponse.requestedTimeframe,
    requestedTimeframe: candlesResponse.requestedTimeframe,
    candles,
    candleCount: candles.length,
    requestedLimit: candlesResponse.requestedLimit,
    returnedCount: candlesResponse.returnedCount ?? candles.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: latest?.timestamp,
    latestClose: latest?.close,
    latestQuote,
    spread: latestQuote?.spread,
    connectionStatus: candles.length ? candlesResponse.connectionStatus : "disconnected",
    depthStatus: candlesResponse.depthStatus,
    usageMode,
    researchEligibility: eligibility,
    sourceLabel,
    sourceMethod: candlesResponse.sourceMethod,
    matchState: match.state,
    matchReason: match.reason,
    firstClose: candles[0]?.close,
    lastClose: latest?.close,
    candleFingerprint: buildMt5ReadOnlyCandleFingerprint(candles),
    fetchedAt,
    storedAt: fetchedAt,
    storageBackend: "session",
    candlesPersisted: false,
    storageWarnings: [],
    warnings: [
      ...candlesResponse.warnings,
      "MT5 read-only feed is market-data only and exposes no order, position, or account mutation authority.",
      match.state === "symbol_mismatch" || match.state === "timeframe_mismatch" ? match.reason : undefined
    ].filter(Boolean) as string[],
    missingEvidence: candlesResponse.missingEvidence,
    ...authority
  };
};
