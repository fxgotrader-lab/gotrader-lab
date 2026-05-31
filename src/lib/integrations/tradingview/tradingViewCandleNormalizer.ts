import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";
import type {
  ActiveTradingViewMcpChartFeed,
  TradingViewCompatibleCandle,
  TradingViewMcpCandlesResponse,
  TradingViewMcpFeedCandle,
  TradingViewMcpSymbolMatchState
} from "@/lib/integrations/tradingview/tradingViewCandleFeedTypes";
import {
  tradingViewMcpFallbackTimeframe,
  tradingViewMcpFuturesFallbackSymbol
} from "@/lib/integrations/tradingview/tradingViewCandleFeedTypes";

const futuresSymbols = new Set<FuturesSymbol>(["ES", "NQ", "MES", "MNQ"]);
const timeframeValues = new Set<Timeframe>(["1m", "5m", "15m", "1h", "4h", "1d"]);

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const symbolAliases: Record<string, string[]> = {
  MNQ: ["MNQ", "MNQ1!", "CME_MINI:MNQ1!", "CME_MINI_DL:MNQ1!"],
  NQ: ["NQ", "NQ1!", "CME_MINI:NQ1!", "CME_MINI_DL:NQ1!"],
  ES: ["ES", "ES1!", "CME_MINI:ES1!", "CME_MINI_DL:ES1!"],
  MES: ["MES", "MES1!", "CME_MINI:MES1!", "CME_MINI_DL:MES1!"],
  YM: ["YM", "YM1!", "CBOT_MINI:YM1!", "CBOT_MINI_DL:YM1!"],
  EURUSD: ["EURUSD", "EUR/USD", "FOREXCOM:EURUSD", "OANDA:EURUSD", "FX:EURUSD"]
};

const resolutionAliases: Record<string, string[]> = {
  "1m": ["1", "1m", "1min"],
  "5m": ["5", "5m", "5min"],
  "15m": ["15", "15m", "15min"],
  "1h": ["60", "1h", "60m"],
  "4h": ["240", "4h", "240m"],
  "1d": ["D", "1D", "1d", "D"]
};

const canonical = (value?: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9!/:]/g, "");

const symbolTokens = (symbol?: string) => {
  const normalized = canonical(symbol);
  if (!normalized) {
    return new Set<string>();
  }
  const withoutExchange = normalized.split(":").pop() ?? normalized;
  return new Set([normalized, withoutExchange, withoutExchange.replace("1!", ""), withoutExchange.replace("/", "")]);
};

const aliasesFor = (symbol?: string) => {
  const direct = canonical(symbol).replace("/", "");
  const key = Object.keys(symbolAliases).find((candidate) =>
    [candidate, ...symbolAliases[candidate]].map(canonical).includes(canonical(symbol))
  );
  return new Set([direct, ...(key ? symbolAliases[key] : []), symbol ?? ""].map(canonical));
};

export const resolveTradingViewMcpSymbolMatch = ({
  chartResolution,
  chartSymbol,
  gotraderSymbol,
  gotraderTimeframe,
  providerSymbol,
  requestedTimeframe
}: {
  gotraderSymbol?: string;
  gotraderTimeframe?: string;
  providerSymbol?: string;
  chartSymbol?: string;
  chartResolution?: string;
  requestedTimeframe?: string;
}): { state: TradingViewMcpSymbolMatchState; reason: string } => {
  if (!gotraderSymbol || !providerSymbol) {
    return { state: "unavailable", reason: "GoTrader symbol or TradingView provider symbol is unavailable." };
  }

  const gotraderAliases = aliasesFor(gotraderSymbol);
  const providerTokens = new Set([...symbolTokens(providerSymbol), ...symbolTokens(chartSymbol)]);
  const exact = canonical(gotraderSymbol) === canonical(providerSymbol) || canonical(gotraderSymbol) === canonical(chartSymbol);
  const equivalent = [...providerTokens].some((token) => gotraderAliases.has(token));
  if (!exact && !equivalent) {
    return {
      state: "symbol_mismatch",
      reason: `TradingView chart symbol ${chartSymbol ?? providerSymbol} does not match GoTrader symbol ${gotraderSymbol}.`
    };
  }

  const expectedResolution = resolutionAliases[gotraderTimeframe ?? ""] ?? [gotraderTimeframe ?? ""];
  const actualResolution = String(chartResolution ?? requestedTimeframe ?? "").trim();
  if (gotraderTimeframe && actualResolution && !expectedResolution.includes(actualResolution)) {
    return {
      state: "timeframe_mismatch",
      reason: `TradingView resolution ${actualResolution} does not match GoTrader timeframe ${gotraderTimeframe}.`
    };
  }

  return exact
    ? { state: "exact_match", reason: "TradingView chart symbol and timeframe match GoTrader selection." }
    : { state: "equivalent_symbol", reason: "TradingView chart symbol is equivalent to the GoTrader symbol alias." };
};

const validNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

export const normalizeTradingViewMcpCandles = (
  response: TradingViewMcpCandlesResponse,
  limit = response.candleCount
): TradingViewMcpFeedCandle[] => {
  const seen = new Set<number>();
  return response.candles
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
    .slice(-Math.max(1, Math.min(500, limit)));
};

const toFuturesSymbol = (symbol?: string): FuturesSymbol => {
  const stripped = canonical(symbol).split(":").pop()?.replace("1!", "") ?? "";
  return futuresSymbols.has(stripped as FuturesSymbol) ? (stripped as FuturesSymbol) : tradingViewMcpFuturesFallbackSymbol;
};

const toTimeframe = (timeframe?: string): Timeframe =>
  timeframeValues.has(timeframe as Timeframe) ? (timeframe as Timeframe) : tradingViewMcpFallbackTimeframe;

export const tradingViewMcpCandlesToGoTraderCandles = (
  feed?: Pick<ActiveTradingViewMcpChartFeed, "candles" | "symbol" | "timeframe" | "providerSymbol"> | null
): TradingViewCompatibleCandle[] => {
  if (!feed) {
    return [];
  }
  const symbol = toFuturesSymbol(feed.symbol);
  const timeframe = toTimeframe(feed.timeframe);
  return feed.candles.map((candle, index): TradingViewCompatibleCandle => ({
    id: candle.id || `tradingview_mcp_${feed.symbol}_${candle.time}_${index}`,
    symbol,
    timeframe,
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    sourceProvider: "tradingview_mcp",
    providerSymbol: feed.providerSymbol
  }));
};

export const createActiveTradingViewMcpChartFeed = ({
  candlesResponse,
  gotraderSymbol,
  gotraderTimeframe
}: {
  candlesResponse: TradingViewMcpCandlesResponse;
  gotraderSymbol?: string;
  gotraderTimeframe?: string;
}): ActiveTradingViewMcpChartFeed => {
  const candles = normalizeTradingViewMcpCandles(candlesResponse);
  const latest = candles[candles.length - 1];
  const match = resolveTradingViewMcpSymbolMatch({
    gotraderSymbol,
    gotraderTimeframe,
    providerSymbol: candlesResponse.symbol,
    chartSymbol: candlesResponse.chartSymbol,
    chartResolution: candlesResponse.chartResolution,
    requestedTimeframe: candlesResponse.requestedTimeframe
  });
  const connectionStatus = candles.length ? "connected_with_candles" : candlesResponse.connectionStatus;
  return {
    provider: "tradingview_mcp",
    dataMode: "tradingview_mcp_chart",
    activeForChart: candles.length > 0,
    symbol: gotraderSymbol ?? candlesResponse.requestedSymbol,
    requestedSymbol: candlesResponse.requestedSymbol,
    providerSymbol: candlesResponse.symbol,
    chartSymbol: candlesResponse.chartSymbol,
    timeframe: gotraderTimeframe ?? candlesResponse.requestedTimeframe,
    requestedTimeframe: candlesResponse.requestedTimeframe,
    chartResolution: candlesResponse.chartResolution,
    candles,
    candleCount: candles.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: latest?.timestamp,
    latestClose: latest?.close,
    connectionStatus,
    sourceLabel: "TradingView MCP chart feed - read-only, not broker truth",
    sourceCommand: candlesResponse.sourceCommand,
    matchState: match.state,
    matchReason: match.reason,
    warnings: [
      ...candlesResponse.warnings,
      "TradingView MCP chart feed is visual/analysis data only and has no broker execution authority.",
      match.state === "symbol_mismatch" || match.state === "timeframe_mismatch" ? match.reason : undefined
    ].filter(Boolean) as string[],
    missingEvidence: candlesResponse.missingEvidence,
    storedAt: new Date().toISOString(),
    ...authority
  };
};

export const isTradingViewMcpChartFeedUsable = (feed?: ActiveTradingViewMcpChartFeed | null) =>
  Boolean(feed?.activeForChart && feed.candleCount > 0 && feed.connectionStatus === "connected_with_candles");

export type { Candle };
