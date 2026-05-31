import type { PreparedCandleSource } from "@/lib/marketData/candleWindowing";
import { createDisconnectedLiveMarketDataStatus } from "@/lib/marketData/liveMarketDataStatus";
import type { LiveMarketDataMode, LiveMarketDataStatus } from "@/lib/marketData/liveMarketDataTypes";
import {
  tradingViewMcpCandlesToGoTraderCandles,
  type ActiveTradingViewMcpChartFeed
} from "@/lib/integrations/tradingview";
import type { Candle } from "@/lib/types";

const sourceModeToLiveDataMode = (source: PreparedCandleSource): LiveMarketDataMode =>
  source.mode === "imported" ? "imported_historical" : "mock";

export const resolveLiveMarketDataStatus = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed
): LiveMarketDataStatus => {
  if (tradingViewFeed?.activeForChart && tradingViewFeed.candleCount > 0) {
    return createDisconnectedLiveMarketDataStatus({
      dataMode: "tradingview_mcp_chart",
      lastCandleTimestamp: tradingViewFeed.lastTimestamp,
      sourceLabel: tradingViewFeed.sourceLabel
    });
  }
  const latestCandle = source.candles[source.candles.length - 1];
  return createDisconnectedLiveMarketDataStatus({
    dataMode: sourceModeToLiveDataMode(source),
    lastCandleTimestamp: latestCandle?.timestamp,
    sourceLabel: source.mode === "imported" ? "imported historical data" : "mock fallback data"
  });
};

export const currentChartSourceLabel = (status: LiveMarketDataStatus, fallbackLabel: string) =>
  status.liveFeedAvailable && status.connectionStatus === "connected" && status.dataMode === "live_feed"
    ? status.liveFeedSourceLabel
    : fallbackLabel;

export type ChartDisplaySourceMode = "mock" | "imported" | "tradingview_mcp_chart";

export interface ResolvedChartDisplaySource {
  activeResearchCandleSource: Candle[];
  activeChartDisplayCandleSource: Candle[];
  activeResearchSourceLabel: string;
  activeChartDisplaySourceLabel: string;
  activeResearchSourceMode: ChartDisplaySourceMode;
  activeChartDisplaySourceMode: ChartDisplaySourceMode;
  chartDisplayUsesTradingViewMcp: boolean;
  researchUsesTradingViewMcp: boolean;
  chartDisplayWarning?: string;
  tradingViewMcpCandleCount: number;
  tradingViewMcpFirstTimestamp?: string;
  tradingViewMcpLastTimestamp?: string;
}

export const resolveChartDisplayCandleSource = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed
): ResolvedChartDisplaySource => {
  const researchSourceMode: ChartDisplaySourceMode = source.mode === "imported" ? "imported" : "mock";
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const chartDisplayUsesTradingViewMcp = Boolean(tradingViewFeed?.activeForChart && tradingViewCandles.length);
  const researchUsesTradingViewMcp = Boolean(tradingViewFeed?.activeForResearch && tradingViewCandles.length);
  const activeResearchCandleSource = researchUsesTradingViewMcp ? tradingViewCandles : source.candles;
  const activeChartDisplayCandleSource = chartDisplayUsesTradingViewMcp
    ? tradingViewCandles
    : activeResearchCandleSource;
  const activeResearchSourceLabel = researchUsesTradingViewMcp
    ? `${tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed"} - research eligible`
    : source.label;
  const activeChartDisplaySourceLabel = chartDisplayUsesTradingViewMcp
    ? `${tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed"} - visual display`
    : activeResearchSourceLabel;
  const chartDisplayWarning = chartDisplayUsesTradingViewMcp && !researchUsesTradingViewMcp
    ? "Chart display source differs from research source. TradingView MCP candles are visual-only and not used for research."
    : tradingViewFeed?.activeForChart && !tradingViewCandles.length
      ? "TradingView MCP chart source selected, but no candles are available; falling back to imported historical."
      : undefined;

  return {
    activeResearchCandleSource,
    activeChartDisplayCandleSource,
    activeResearchSourceLabel,
    activeChartDisplaySourceLabel,
    activeResearchSourceMode: researchUsesTradingViewMcp ? "tradingview_mcp_chart" : researchSourceMode,
    activeChartDisplaySourceMode: chartDisplayUsesTradingViewMcp
      ? "tradingview_mcp_chart"
      : researchUsesTradingViewMcp
        ? "tradingview_mcp_chart"
        : researchSourceMode,
    chartDisplayUsesTradingViewMcp,
    researchUsesTradingViewMcp,
    chartDisplayWarning,
    tradingViewMcpCandleCount: tradingViewCandles.length,
    tradingViewMcpFirstTimestamp: tradingViewCandles[0]?.timestamp,
    tradingViewMcpLastTimestamp: tradingViewCandles[tradingViewCandles.length - 1]?.timestamp
  };
};
