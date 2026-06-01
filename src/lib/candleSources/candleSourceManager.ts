import type { ActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview";
import { tradingViewMcpCandlesToGoTraderCandles } from "@/lib/integrations/tradingview";
import type { ActiveMt5ReadOnlyCandleFeed } from "@/lib/integrations/mt5";
import { mt5ReadOnlyCandlesToGoTraderCandles } from "@/lib/integrations/mt5";
import type { PreparedCandleSource } from "@/lib/marketData/candleWindowing";
import type {
  CanonicalCandleProvider,
  CanonicalCandleSource,
  CanonicalCandleSourceManagerState,
  CanonicalCandleSourceRole,
  CanonicalCandleStorageBackend
} from "@/lib/candleSources/candleSourceTypes";
import { canonicalNoAuthority } from "@/lib/candleSources/candleSourceTypes";
import {
  evaluateCanonicalCandleSourceEligibility
} from "@/lib/candleSources/candleSourceEligibility";
import {
  candleSourceFirstLast,
  createCandleSourceFingerprint,
  normalizeCandleSourceSymbol
} from "@/lib/candleSources/candleSourceFingerprint";
import { summarizeCanonicalCandleSource } from "@/lib/candleSources/candleSourceStorage";
import type { Candle } from "@/lib/types";

const now = () => new Date().toISOString();

const sourceIdFor = (provider: CanonicalCandleProvider, symbol: string, timeframe: string, suffix: string) =>
  `${provider}:${normalizeCandleSourceSymbol(symbol)}:${timeframe}:${suffix}`;

export function createCanonicalCandleSource({
  candles,
  provider,
  providerSymbol,
  roles = ["available"],
  sourceId,
  sourceLabel,
  storageBackend,
  symbol,
  timeframe,
  symbolMatches: symbolMatchesOverride,
  timeframeMatches: timeframeMatchesOverride,
  userSelectedForResearch = false,
  userSelectedForWalkForward = false,
  warnings = [],
  sourceCommand,
  fetchedAt,
  importedAt
}: {
  candles: Candle[];
  provider: CanonicalCandleProvider;
  providerSymbol?: string;
  roles?: CanonicalCandleSourceRole[];
  sourceId?: string;
  sourceLabel: string;
  storageBackend: CanonicalCandleStorageBackend;
  symbol: string;
  timeframe: string;
  symbolMatches?: boolean;
  timeframeMatches?: boolean;
  userSelectedForResearch?: boolean;
  userSelectedForWalkForward?: boolean;
  warnings?: string[];
  sourceCommand?: string;
  fetchedAt?: string;
  importedAt?: string;
}): CanonicalCandleSource {
  const normalizedSymbol = normalizeCandleSourceSymbol(symbol);
  const normalizedProviderSymbol = providerSymbol ? normalizeCandleSourceSymbol(providerSymbol) : normalizedSymbol;
  const symbolMatches =
    symbolMatchesOverride ?? (normalizedSymbol === normalizedProviderSymbol || normalizedProviderSymbol.includes(normalizedSymbol));
  const { dataQuality, eligibility, reasons } = evaluateCanonicalCandleSourceEligibility({
    candles,
    symbolMatches,
    timeframeMatches: timeframeMatchesOverride ?? true,
    userSelectedForResearch,
    userSelectedForWalkForward
  });
  const resolvedSourceId = sourceId ?? sourceIdFor(provider, symbol, timeframe, normalizedProviderSymbol);
  const firstLast = candleSourceFirstLast(candles);
  const fingerprint = createCandleSourceFingerprint({
    candles,
    provider,
    sourceId: resolvedSourceId,
    symbol,
    timeframe
  });
  const generatedAt = now();

  return {
    sourceId: resolvedSourceId,
    provider,
    symbol,
    normalizedSymbol,
    timeframe,
    candles,
    candleCount: candles.length,
    ...firstLast,
    storageBackend,
    dataQuality,
    eligibility,
    eligibilityReasons: reasons,
    warnings,
    provenance: {
      sourceLabel,
      providerSymbol,
      importedAt,
      fetchedAt,
      generatedAt,
      sourceCommand,
      sourceVersion: "canonical-candle-source-manager-v1"
    },
    authority: canonicalNoAuthority,
    fingerprint,
    roles,
    lastUpdatedAt: fetchedAt ?? importedAt ?? generatedAt
  };
}

export function canonicalSourceFromPreparedSource(source: PreparedCandleSource): CanonicalCandleSource {
  const provider: CanonicalCandleProvider = source.mode === "imported" ? "imported_historical" : "mock";
  const symbol = source.metadata?.symbol ?? source.candles[0]?.symbol ?? "NQ";
  const timeframe = source.appliedSettings.targetTimeframe ?? source.metadata?.timeframe ?? source.candles[0]?.timeframe ?? "5m";
  const sourceId = source.mode === "imported" && source.metadata?.importId
    ? `imported_historical:${source.metadata.importId}`
    : "mock:active";
  return createCanonicalCandleSource({
    candles: source.candles,
    provider,
    roles: source.mode === "imported" ? ["chart_display", "research", "walk_forward", "available"] : ["chart_display", "research", "available"],
    sourceId,
    sourceLabel: source.label,
    storageBackend: source.mode === "imported" ? "indexeddb" : "mock",
    symbol,
    timeframe,
    userSelectedForResearch: true,
    userSelectedForWalkForward: source.mode === "imported",
    warnings: source.warnings,
    importedAt: source.metadata?.importedAt
  });
}

export function canonicalSourceFromTradingViewFeed(feed?: ActiveTradingViewMcpChartFeed): CanonicalCandleSource | undefined {
  if (!feed) {
    return undefined;
  }
  const candles = tradingViewMcpCandlesToGoTraderCandles(feed);
  return createCanonicalCandleSource({
    candles,
    provider: "tradingview_mcp",
    providerSymbol: feed.providerSymbol,
    roles: [
      feed.activeForChart ? "chart_display" : "available",
      feed.activeForResearch ? "research" : "available"
    ],
    sourceId: feed.feedId,
    sourceLabel: feed.sourceLabel,
    storageBackend: feed.storageBackend === "indexeddb" ? "indexeddb" : feed.storageBackend === "session" ? "session" : "memory",
    symbol: feed.requestedSymbol,
    timeframe: feed.requestedTimeframe,
    userSelectedForResearch: feed.activeForResearch,
    userSelectedForWalkForward: false,
    warnings: [
      ...feed.warnings,
      "TradingView MCP candles are read-only chart data and not broker truth."
    ],
    sourceCommand: feed.sourceCommand,
    fetchedAt: feed.fetchedAt
  });
}

export function plannedMt5CanonicalSource(symbol = "MNQ", timeframe = "5m"): CanonicalCandleSource {
  return createCanonicalCandleSource({
    candles: [],
    provider: "mt5_read_only",
    roles: ["available"],
    sourceId: sourceIdFor("mt5_read_only", symbol, timeframe, "planned"),
    sourceLabel: "MT5 read-only feed planned - disconnected",
    storageBackend: "memory",
    symbol,
    timeframe,
    warnings: [
      "MT5 read-only quotes/candles are planned but not connected.",
      "No MT5 execution or order calls are available in this phase."
    ]
  });
}

export function canonicalSourceFromMt5ReadOnlyFeed(feed?: ActiveMt5ReadOnlyCandleFeed): CanonicalCandleSource | undefined {
  if (!feed) {
    return undefined;
  }
  const candles = mt5ReadOnlyCandlesToGoTraderCandles(feed);
  return createCanonicalCandleSource({
    candles,
    provider: "mt5_read_only",
    providerSymbol: feed.brokerSymbol,
    roles: [
      feed.activeForChart ? "chart_display" : "available",
      feed.activeForResearch ? "research" : "available",
      feed.researchEligibility.walkForwardEligible ? "walk_forward" : "available"
    ],
    sourceId: feed.feedId,
    sourceLabel: feed.sourceLabel,
    storageBackend: feed.storageBackend === "indexeddb" ? "indexeddb" : feed.storageBackend === "session" ? "session" : "memory",
    symbolMatches: feed.researchEligibility.symbolMatch,
    timeframeMatches: feed.researchEligibility.timeframeMatch,
    symbol: feed.symbol,
    timeframe: feed.timeframe,
    userSelectedForResearch: feed.activeForResearch,
    userSelectedForWalkForward: false,
    warnings: [
      ...feed.warnings,
      "MT5 read-only candles are market data only and not execution authority."
    ],
    sourceCommand: feed.sourceMethod,
    fetchedAt: feed.fetchedAt
  });
}

export function resolveCanonicalCandleSourceManager({
  preparedSource,
  mt5Feed,
  tradingViewFeed
}: {
  preparedSource: PreparedCandleSource;
  mt5Feed?: ActiveMt5ReadOnlyCandleFeed;
  tradingViewFeed?: ActiveTradingViewMcpChartFeed;
}): CanonicalCandleSourceManagerState {
  const prepared = canonicalSourceFromPreparedSource(preparedSource);
  const tradingView = canonicalSourceFromTradingViewFeed(tradingViewFeed);
  const connectedMt5 = canonicalSourceFromMt5ReadOnlyFeed(mt5Feed);
  const mt5 = connectedMt5 ?? plannedMt5CanonicalSource(prepared.symbol, prepared.timeframe);
  const activeChart = connectedMt5?.eligibility.chartDisplay && mt5Feed?.activeForChart
    ? connectedMt5
    : tradingView?.eligibility.chartDisplay && tradingViewFeed?.activeForChart
      ? tradingView
      : prepared;
  const activeResearch = connectedMt5?.eligibility.researchCycle && mt5Feed?.activeForResearch
    ? connectedMt5
    : tradingView?.eligibility.researchCycle && tradingViewFeed?.activeForResearch
      ? tradingView
      : prepared;
  const activeWalkForward = prepared.provider === "imported_historical"
    ? prepared
    : connectedMt5?.eligibility.walkForward
      ? connectedMt5
      : mt5;
  const sources = [prepared, tradingView, mt5].filter((source): source is CanonicalCandleSource => Boolean(source));
  const warnings = [
    tradingView && tradingViewFeed?.activeForChart && !tradingView.eligibility.researchCycle
      ? "TradingView MCP is available for chart display but not eligible for research/walk-forward."
      : undefined,
    connectedMt5 && mt5Feed?.activeForChart && !connectedMt5.eligibility.researchCycle
      ? "MT5 read-only is available for chart display but not eligible for research/walk-forward."
      : undefined,
    activeWalkForward.provider !== "imported_historical"
      ? "Walk-forward source is not imported historical data; keep walk-forward blocked until sufficient read-only historical depth exists."
      : undefined
  ].filter((warning): warning is string => Boolean(warning));

  return {
    activeChartSource: summarizeCanonicalCandleSource(activeChart),
    activeResearchSource: summarizeCanonicalCandleSource(activeResearch),
    activeWalkForwardSource: summarizeCanonicalCandleSource(activeWalkForward),
    allAvailableSources: sources.map(summarizeCanonicalCandleSource),
    warnings,
    generatedAt: now()
  };
}
