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

export interface CandleSourceIdentity {
  candleCount: number;
  dataFingerprint: string;
  firstClose?: number;
  firstTimestamp?: string;
  lastClose?: number;
  lastTimestamp?: string;
  sourceLabel: string;
  sourceMode: ChartDisplaySourceMode;
}

export interface ResolvedActiveCandleSource {
  candles: Candle[];
  fallbackReason?: string;
  identity: CandleSourceIdentity;
  sourceLabel: string;
  sourceMode: ChartDisplaySourceMode;
  sourceKey: string;
  usesTradingViewMcp: boolean;
}

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
  chartDisplayIdentity: CandleSourceIdentity;
  chartDisplaySourceKey: string;
  importedIdentity: CandleSourceIdentity;
  researchIdentity: CandleSourceIdentity;
  researchSourceKey: string;
  tradingViewMcpIdentity: CandleSourceIdentity;
  fallbackReason?: string;
}

const compactNumber = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(5)) : undefined;

export const createCandleSourceIdentity = (
  candles: Candle[],
  sourceMode: ChartDisplaySourceMode,
  sourceLabel: string
): CandleSourceIdentity => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  const firstClose = compactNumber(first?.close);
  const lastClose = compactNumber(last?.close);
  const dataFingerprint = [
    sourceMode,
    sourceLabel,
    candles.length,
    first?.timestamp ?? "no-first",
    firstClose ?? "no-first-close",
    last?.timestamp ?? "no-last",
    lastClose ?? "no-last-close"
  ].join("|");

  return {
    candleCount: candles.length,
    dataFingerprint,
    firstClose,
    firstTimestamp: first?.timestamp,
    lastClose,
    lastTimestamp: last?.timestamp,
    sourceLabel,
    sourceMode
  };
};

export const resolveActiveResearchCandleSource = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed
): ResolvedActiveCandleSource => {
  const researchSourceMode: ChartDisplaySourceMode = source.mode === "imported" ? "imported" : "mock";
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const researchUsesTradingViewMcp = Boolean(tradingViewFeed?.activeForResearch && tradingViewCandles.length);
  const candles = researchUsesTradingViewMcp ? tradingViewCandles : source.candles;
  const sourceMode: ChartDisplaySourceMode = researchUsesTradingViewMcp ? "tradingview_mcp_chart" : researchSourceMode;
  const sourceLabel = researchUsesTradingViewMcp
    ? `${tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed"} - research eligible`
    : source.label;
  const identity = createCandleSourceIdentity(candles, sourceMode, sourceLabel);

  return {
    candles,
    identity,
    sourceLabel,
    sourceMode,
    sourceKey: identity.dataFingerprint,
    usesTradingViewMcp: researchUsesTradingViewMcp
  };
};

export const resolveActiveChartDisplayCandleSource = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed
): ResolvedActiveCandleSource => {
  const researchSource = resolveActiveResearchCandleSource(source, tradingViewFeed);
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const chartDisplayUsesTradingViewMcp = Boolean(tradingViewFeed?.activeForChart && tradingViewCandles.length);
  const fallbackReason = tradingViewFeed?.activeForChart && !tradingViewCandles.length
    ? "TradingView MCP chart source selected, but no candles are available; falling back to the active research source."
    : undefined;
  const candles = chartDisplayUsesTradingViewMcp ? tradingViewCandles : researchSource.candles;
  const sourceMode: ChartDisplaySourceMode = chartDisplayUsesTradingViewMcp ? "tradingview_mcp_chart" : researchSource.sourceMode;
  const sourceLabel = chartDisplayUsesTradingViewMcp
    ? `${tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed"} - visual display`
    : researchSource.sourceLabel;
  const identity = createCandleSourceIdentity(candles, sourceMode, sourceLabel);

  return {
    candles,
    fallbackReason,
    identity,
    sourceLabel,
    sourceMode,
    sourceKey: identity.dataFingerprint,
    usesTradingViewMcp: chartDisplayUsesTradingViewMcp
  };
};

export const resolveChartDisplayCandleSource = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed
): ResolvedChartDisplaySource => {
  const researchSourceMode: ChartDisplaySourceMode = source.mode === "imported" ? "imported" : "mock";
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const researchSource = resolveActiveResearchCandleSource(source, tradingViewFeed);
  const chartDisplaySource = resolveActiveChartDisplayCandleSource(source, tradingViewFeed);
  const chartDisplayUsesTradingViewMcp = chartDisplaySource.usesTradingViewMcp;
  const researchUsesTradingViewMcp = researchSource.usesTradingViewMcp;
  const activeResearchCandleSource = researchSource.candles;
  const activeChartDisplayCandleSource = chartDisplaySource.candles;
  const activeResearchSourceLabel = researchSource.sourceLabel;
  const activeChartDisplaySourceLabel = chartDisplaySource.sourceLabel;
  const tradingViewMcpIdentity = createCandleSourceIdentity(
    tradingViewCandles,
    "tradingview_mcp_chart",
    tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed - read-only, not broker truth"
  );
  const importedIdentity = createCandleSourceIdentity(source.candles, researchSourceMode, source.label);
  const chartDisplayWarning = chartDisplayUsesTradingViewMcp && !researchUsesTradingViewMcp
    ? "Chart display source differs from research source. TradingView MCP candles are visual-only and not used for research."
    : chartDisplaySource.fallbackReason;

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
    tradingViewMcpLastTimestamp: tradingViewCandles[tradingViewCandles.length - 1]?.timestamp,
    chartDisplayIdentity: chartDisplaySource.identity,
    chartDisplaySourceKey: chartDisplaySource.sourceKey,
    fallbackReason: chartDisplaySource.fallbackReason,
    importedIdentity,
    researchIdentity: researchSource.identity,
    researchSourceKey: researchSource.sourceKey,
    tradingViewMcpIdentity
  };
};
