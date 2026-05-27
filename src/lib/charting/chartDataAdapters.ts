import type { PreparedCandleSource } from "@/lib/marketData";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";
import type { ChartDataSourceType, TradingChartPropsData, TradingChartSourceMeta } from "@/lib/charting/chartTypes";
import { candlesToChartData } from "@/lib/charting/seriesAdapters";

const sourceFlags = (sourceType: ChartDataSourceType) => ({
  isImported: sourceType === "imported",
  isLive: sourceType === "live_placeholder",
  isMock: sourceType === "mock",
  isReplay: sourceType === "replay"
});

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
  const latest = candles[candles.length - 1];
  return {
    candleCount: candles.length,
    lastTimestamp: latest?.timestamp,
    sourceLabel,
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
