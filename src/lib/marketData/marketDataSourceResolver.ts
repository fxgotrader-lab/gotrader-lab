import type { PreparedCandleSource } from "@/lib/marketData/candleWindowing";
import { createDisconnectedLiveMarketDataStatus } from "@/lib/marketData/liveMarketDataStatus";
import type { LiveMarketDataMode, LiveMarketDataStatus } from "@/lib/marketData/liveMarketDataTypes";
import {
  tradingViewMcpCandlesToGoTraderCandles,
  type ActiveTradingViewMcpChartFeed
} from "@/lib/integrations/tradingview";
import {
  mt5ReadOnlyCandlesToGoTraderCandles,
  type ActiveMt5ReadOnlyCandleFeed
} from "@/lib/integrations/mt5";
import {
  resolveCanonicalCandleSourceManager,
  type CanonicalCandleSourceSummary
} from "@/lib/candleSources";
import type { Candle } from "@/lib/types";

const sourceModeToLiveDataMode = (source: PreparedCandleSource): LiveMarketDataMode =>
  source.mode === "imported" ? "imported_historical" : "mock";

export const resolveLiveMarketDataStatus = (
  source: PreparedCandleSource,
  mt5Feed?: ActiveMt5ReadOnlyCandleFeed,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed
): LiveMarketDataStatus => {
  if (mt5Feed?.activeForChart && mt5Feed.candleCount > 0) {
    return createDisconnectedLiveMarketDataStatus({
      dataMode: "mt5_read_only",
      lastCandleTimestamp: mt5Feed.lastTimestamp,
      sourceLabel: mt5Feed.sourceLabel
    });
  }
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

export type ChartDisplaySourceMode = "mock" | "imported" | "tradingview_mcp_chart" | "mt5_read_only";

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
  activeChartSource: CanonicalCandleSourceSummary;
  activeResearchSource: CanonicalCandleSourceSummary;
  activeWalkForwardSource: CanonicalCandleSourceSummary;
  allAvailableSources: CanonicalCandleSourceSummary[];
  activeResearchCandleSource: Candle[];
  activeChartDisplayCandleSource: Candle[];
  activeResearchSourceLabel: string;
  activeChartDisplaySourceLabel: string;
  activeResearchSourceMode: ChartDisplaySourceMode;
  activeChartDisplaySourceMode: ChartDisplaySourceMode;
  chartDisplayUsesTradingViewMcp: boolean;
  chartDisplayUsesMt5ReadOnly: boolean;
  researchUsesTradingViewMcp: boolean;
  researchUsesMt5ReadOnly: boolean;
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
  mt5ReadOnlyIdentity: CandleSourceIdentity;
  canonicalWarnings: string[];
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
  tradingViewFeed?: ActiveTradingViewMcpChartFeed,
  mt5Feed?: ActiveMt5ReadOnlyCandleFeed
): ResolvedActiveCandleSource => {
  const researchSourceMode: ChartDisplaySourceMode = source.mode === "imported" ? "imported" : "mock";
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const mt5Candles = mt5ReadOnlyCandlesToGoTraderCandles(mt5Feed);
  const researchUsesMt5ReadOnly = Boolean(mt5Feed?.activeForResearch && mt5Candles.length);
  const researchUsesTradingViewMcp = Boolean(tradingViewFeed?.activeForResearch && tradingViewCandles.length);
  const candles = researchUsesMt5ReadOnly ? mt5Candles : researchUsesTradingViewMcp ? tradingViewCandles : source.candles;
  const sourceMode: ChartDisplaySourceMode = researchUsesMt5ReadOnly ? "mt5_read_only" : researchUsesTradingViewMcp ? "tradingview_mcp_chart" : researchSourceMode;
  const sourceLabel = researchUsesMt5ReadOnly
    ? `${mt5Feed?.sourceLabel ?? "MT5 read-only candle feed"} - research eligible`
    : researchUsesTradingViewMcp
    ? `${tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed"} - research eligible`
    : source.label;
  const identity = createCandleSourceIdentity(candles, sourceMode, sourceLabel);

  return {
    candles,
    identity,
    sourceLabel,
    sourceMode,
    sourceKey: identity.dataFingerprint,
    usesTradingViewMcp: researchUsesTradingViewMcp || researchUsesMt5ReadOnly
  };
};

export const resolveActiveChartDisplayCandleSource = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed,
  mt5Feed?: ActiveMt5ReadOnlyCandleFeed
): ResolvedActiveCandleSource => {
  const researchSource = resolveActiveResearchCandleSource(source, tradingViewFeed, mt5Feed);
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const mt5Candles = mt5ReadOnlyCandlesToGoTraderCandles(mt5Feed);
  const chartDisplayUsesMt5ReadOnly = Boolean(mt5Feed?.activeForChart && mt5Candles.length);
  const chartDisplayUsesTradingViewMcp = Boolean(tradingViewFeed?.activeForChart && tradingViewCandles.length);
  const fallbackReason = mt5Feed?.activeForChart && !mt5Candles.length
    ? "MT5 read-only chart source selected, but no candles are available; falling back to the active research source."
    : tradingViewFeed?.activeForChart && !tradingViewCandles.length
    ? "TradingView MCP chart source selected, but no candles are available; falling back to the active research source."
    : undefined;
  const candles = chartDisplayUsesMt5ReadOnly ? mt5Candles : chartDisplayUsesTradingViewMcp ? tradingViewCandles : researchSource.candles;
  const sourceMode: ChartDisplaySourceMode = chartDisplayUsesMt5ReadOnly ? "mt5_read_only" : chartDisplayUsesTradingViewMcp ? "tradingview_mcp_chart" : researchSource.sourceMode;
  const sourceLabel = chartDisplayUsesMt5ReadOnly
    ? `${mt5Feed?.sourceLabel ?? "MT5 read-only candle feed"} - visual display`
    : chartDisplayUsesTradingViewMcp
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
    usesTradingViewMcp: chartDisplayUsesTradingViewMcp || chartDisplayUsesMt5ReadOnly
  };
};

export const resolveChartDisplayCandleSource = (
  source: PreparedCandleSource,
  tradingViewFeed?: ActiveTradingViewMcpChartFeed,
  mt5Feed?: ActiveMt5ReadOnlyCandleFeed
): ResolvedChartDisplaySource => {
  const canonical = resolveCanonicalCandleSourceManager({ preparedSource: source, tradingViewFeed, mt5Feed });
  const researchSourceMode: ChartDisplaySourceMode = source.mode === "imported" ? "imported" : "mock";
  const tradingViewCandles = tradingViewMcpCandlesToGoTraderCandles(tradingViewFeed);
  const mt5Candles = mt5ReadOnlyCandlesToGoTraderCandles(mt5Feed);
  const researchSource = resolveActiveResearchCandleSource(source, tradingViewFeed, mt5Feed);
  const chartDisplaySource = resolveActiveChartDisplayCandleSource(source, tradingViewFeed, mt5Feed);
  const chartDisplayUsesTradingViewMcp = chartDisplaySource.sourceMode === "tradingview_mcp_chart";
  const chartDisplayUsesMt5ReadOnly = chartDisplaySource.sourceMode === "mt5_read_only";
  const researchUsesTradingViewMcp = researchSource.sourceMode === "tradingview_mcp_chart";
  const researchUsesMt5ReadOnly = researchSource.sourceMode === "mt5_read_only";
  const activeResearchCandleSource = researchSource.candles;
  const activeChartDisplayCandleSource = chartDisplaySource.candles;
  const activeResearchSourceLabel = researchSource.sourceLabel;
  const activeChartDisplaySourceLabel = chartDisplaySource.sourceLabel;
  const tradingViewMcpIdentity = createCandleSourceIdentity(
    tradingViewCandles,
    "tradingview_mcp_chart",
    tradingViewFeed?.sourceLabel ?? "TradingView MCP chart feed - read-only, not broker truth"
  );
  const mt5ReadOnlyIdentity = createCandleSourceIdentity(
    mt5Candles,
    "mt5_read_only",
    mt5Feed?.sourceLabel ?? "MT5 read-only candle feed - no execution authority"
  );
  const importedIdentity = createCandleSourceIdentity(source.candles, researchSourceMode, source.label);
  const chartDisplayWarning = chartDisplayUsesMt5ReadOnly && !researchUsesMt5ReadOnly
    ? "Chart display source differs from research source. MT5 read-only candles are visual-only and not used for research."
    : chartDisplayUsesTradingViewMcp && !researchUsesTradingViewMcp
    ? "Chart display source differs from research source. TradingView MCP candles are visual-only and not used for research."
    : chartDisplaySource.fallbackReason;

  return {
    activeChartSource: canonical.activeChartSource,
    activeResearchSource: canonical.activeResearchSource,
    activeWalkForwardSource: canonical.activeWalkForwardSource,
    allAvailableSources: canonical.allAvailableSources,
    activeResearchCandleSource,
    activeChartDisplayCandleSource,
    activeResearchSourceLabel,
    activeChartDisplaySourceLabel,
    activeResearchSourceMode: researchUsesTradingViewMcp
      ? "tradingview_mcp_chart"
      : researchUsesMt5ReadOnly
        ? "mt5_read_only"
        : researchSourceMode,
    activeChartDisplaySourceMode: chartDisplayUsesTradingViewMcp
      ? "tradingview_mcp_chart"
      : chartDisplayUsesMt5ReadOnly
        ? "mt5_read_only"
      : researchUsesTradingViewMcp
        ? "tradingview_mcp_chart"
        : researchUsesMt5ReadOnly
          ? "mt5_read_only"
        : researchSourceMode,
    chartDisplayUsesTradingViewMcp,
    chartDisplayUsesMt5ReadOnly,
    researchUsesTradingViewMcp,
    researchUsesMt5ReadOnly,
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
    tradingViewMcpIdentity,
    mt5ReadOnlyIdentity,
    canonicalWarnings: canonical.warnings
  };
};
