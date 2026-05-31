import type { PreparedCandleSource } from "@/lib/marketData";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";
import type { ChartDataSourceType, TradingChartPropsData, TradingChartSourceMeta } from "@/lib/charting/chartTypes";
import { candlesToChartData } from "@/lib/charting/seriesAdapters";

const sourceFlags = (sourceType: ChartDataSourceType) => ({
  isImported: sourceType === "imported",
  isLive: sourceType === "live_feed",
  isMock: sourceType === "mock",
  isReplay: sourceType === "replay"
});

const compactNumber = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(5)) : undefined;

export const fingerprintCandles = (candles: Candle[], sourceType: ChartDataSourceType, sourceLabel: string) => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  const firstClose = compactNumber(first?.close);
  const lastClose = compactNumber(last?.close);
  return [
    sourceType,
    sourceLabel,
    candles.length,
    first?.timestamp ?? "no-first",
    firstClose ?? "no-first-close",
    last?.timestamp ?? "no-last",
    lastClose ?? "no-last-close"
  ].join("|");
};

export const createChartSourceMeta = ({
  candles,
  sourceLabel,
  sourceType,
  symbol,
  timeframe
}: {
  candles: Candle[];
  sourceLabel: string;
  sourceType: ChartDataSourceType;
  symbol?: FuturesSymbol | string;
  timeframe?: Timeframe | string;
}): TradingChartSourceMeta => {
  const first = candles[0];
  const latest = candles[candles.length - 1];
  const dataFingerprint = fingerprintCandles(candles, sourceType, sourceLabel);
  return {
    candleCount: candles.length,
    dataFingerprint,
    firstClose: compactNumber(first?.close),
    firstTimestamp: first?.timestamp,
    lastClose: compactNumber(latest?.close),
    lastTimestamp: latest?.timestamp,
    sourceLabel,
    sourceKey: dataFingerprint,
    sourceType,
    symbol: symbol ?? latest?.symbol ?? "NQ",
    timeframe: timeframe ?? latest?.timeframe ?? "5m",
    ...sourceFlags(sourceType)
  };
};

export const createTradingChartData = ({
  candles,
  sourceLabel,
  sourceType,
  symbol,
  timeframe
}: {
  candles: Candle[];
  sourceLabel: string;
  sourceType: ChartDataSourceType;
  symbol?: FuturesSymbol | string;
  timeframe?: Timeframe | string;
}): Pick<TradingChartPropsData, "candles" | "source"> => ({
  candles: candlesToChartData(candles),
  source: createChartSourceMeta({ candles, sourceLabel, sourceType, symbol, timeframe })
});

export const preparedSourceToChartData = (source: PreparedCandleSource): Pick<TradingChartPropsData, "candles" | "source"> =>
  createTradingChartData({
    candles: source.candles,
    sourceLabel: source.mode === "imported" ? source.label : "Mock research candles",
    sourceType: source.mode === "imported" ? "imported" : "mock",
    symbol: source.metadata?.symbol,
    timeframe: source.metadata?.timeframe
  });

export const createFutureLiveFeedAdapter = () => ({
  connect: () => {
    throw new Error("Future live feed adapter is a placeholder only. Live data is not connected.");
  },
  label: "Future live feed not connected",
  status: "future_live_not_connected" as const,
  type: "live_placeholder" as const
});
