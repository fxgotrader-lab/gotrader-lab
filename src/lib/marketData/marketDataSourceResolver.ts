import type { PreparedCandleSource } from "@/lib/marketData/candleWindowing";
import { createDisconnectedLiveMarketDataStatus } from "@/lib/marketData/liveMarketDataStatus";
import type { LiveMarketDataMode, LiveMarketDataStatus } from "@/lib/marketData/liveMarketDataTypes";
import type { ActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview";

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
