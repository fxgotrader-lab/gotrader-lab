import {
  loadActiveMt5ReadOnlyCandleFeed,
  loadMt5ReadOnlySettings,
  loadMt5ReadOnlyStatus
} from "@/lib/integrations/mt5/mt5ReadOnlyClient";
import { loadMt5HigherTimeframeSourceSummaries } from "@/lib/integrations/mt5/mt5MultiTimeframe";
import type {
  ActiveMt5ReadOnlyCandleFeed,
  Mt5ReadOnlyRuntimeState
} from "@/lib/integrations/mt5/mt5ReadOnlyTypes";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

export const resolveMt5ReadOnlyRuntimeState = (
  providedFeed: ActiveMt5ReadOnlyCandleFeed | undefined = loadActiveMt5ReadOnlyCandleFeed()
): Mt5ReadOnlyRuntimeState => {
  const settings = loadMt5ReadOnlySettings();
  const status = loadMt5ReadOnlyStatus();
  const feed = providedFeed;
  const latestQuote = feed?.latestQuote;
  const sourceWarnings = [
    ...status.warnings,
    ...(feed?.warnings ?? []),
    ...(feed?.activeForChart && !feed.activeForResearch
      ? ["MT5 read-only candles are chart-only unless the research eligibility gate passes and the user selects research source."]
      : [])
  ].filter((warning, index, warnings): warning is string => Boolean(warning) && warnings.indexOf(warning) === index);

  return {
    bridgeUrl: settings.bridgeUrl,
    connectionStatus: feed?.connectionStatus ?? status.connectionStatus,
    wrapperRunning: status.connectionStatus === "connected" || status.connectionStatus === "degraded" || Boolean(feed?.activeForChart),
    message: status.message,
    latestQuote,
    latestQuoteTimestamp: latestQuote?.timestamp,
    spread: latestQuote?.spread ?? feed?.spread,
    candleFeedAvailable: Boolean(feed?.activeForChart && feed.candleCount > 0),
    candleCount: feed?.candleCount ?? 0,
    requestedLimit: feed?.requestedLimit,
    returnedCount: feed?.returnedCount,
    firstTimestamp: feed?.firstTimestamp,
    lastTimestamp: feed?.lastTimestamp,
    feedSymbol: feed?.symbol,
    brokerSymbol: feed?.brokerSymbol ?? settings.brokerSymbolOverride,
    timeframe: feed?.timeframe,
    latestPrice: latestQuote?.mid ?? latestQuote?.bid ?? latestQuote?.ask ?? feed?.latestClose,
    depthStatus: feed?.depthStatus,
    storageBackend: feed?.storageBackend,
    candlesPersisted: Boolean(feed?.candlesPersisted),
    feedId: feed?.feedId,
    usageMode: feed?.usageMode ?? "none",
    researchEligibility: feed?.researchEligibility.state ?? "ineligible_disconnected",
    eligibilityReasons: feed?.researchEligibility.reasons ?? ["MT5 read-only candle feed is not active."],
    displayLabel: settings.displayLabel,
    higherTimeframes: settings.higherTimeframes,
    higherTimeframeSources: loadMt5HigherTimeframeSourceSummaries().filter(
      (source) =>
        source.requestedSymbol === (feed?.requestedSymbol ?? settings.requestedSymbol ?? "MNQ") &&
        (!source.brokerSymbol || source.brokerSymbol === (feed?.brokerSymbol ?? settings.brokerSymbolOverride))
    ),
    sourceWarnings,
    symbolMatch: Boolean(feed?.researchEligibility.symbolMatch),
    timeframeMatch: Boolean(feed?.researchEligibility.timeframeMatch),
    activeForChart: Boolean(feed?.activeForChart),
    activeForResearch: Boolean(feed?.activeForResearch),
    lastCheckedAt: status.lastCheckedAt,
    ...authority
  };
};
