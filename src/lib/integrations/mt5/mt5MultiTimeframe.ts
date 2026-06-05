import {
  fetchMt5ReadOnlyCandles,
  loadMt5ReadOnlySettings
} from "@/lib/integrations/mt5/mt5ReadOnlyClient";
import {
  buildMt5ReadOnlyCandleFingerprint,
  createActiveMt5ReadOnlyCandleFeed,
  mt5ReadOnlyCandlesToGoTraderCandles
} from "@/lib/integrations/mt5/mt5ReadOnlyNormalizer";
import type { Mt5HigherTimeframeSourceSummary } from "@/lib/integrations/mt5/mt5SymbolSettings";
import { mt5CfdProxyWarning, sanitizeMt5HigherTimeframes, sanitizeMt5ReadOnlyTimeframe } from "@/lib/integrations/mt5/mt5SymbolSettings";
import { createCanonicalCandleSource, saveCanonicalCandleSource } from "@/lib/candleSources";
import type { Timeframe } from "@/lib/types";

export const MT5_HIGHER_TIMEFRAME_SOURCES_KEY = "gotrader-ai-lab-mt5-readonly-higher-timeframe-sources";
export const MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT = "gotrader-ai-lab-mt5-readonly-higher-timeframes-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const publish = (sources: Mt5HigherTimeframeSourceSummary[]) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT, { detail: sources }));
  }
};

export const loadMt5HigherTimeframeSourceSummaries = (): Mt5HigherTimeframeSourceSummary[] => {
  if (!isBrowser()) {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MT5_HIGHER_TIMEFRAME_SOURCES_KEY) ?? "[]") as Mt5HigherTimeframeSourceSummary[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.provider === "mt5_read_only") : [];
  } catch {
    return [];
  }
};

export const saveMt5HigherTimeframeSourceSummaries = (sources: Mt5HigherTimeframeSourceSummary[]) => {
  const unique = new Map<string, Mt5HigherTimeframeSourceSummary>();
  sources.forEach((source) => {
    unique.set(`${source.requestedSymbol}|${source.brokerSymbol ?? ""}|${source.timeframe}`, source);
  });
  const saved = [...unique.values()].sort((left, right) => left.timeframe.localeCompare(right.timeframe));
  if (isBrowser()) {
    window.localStorage.setItem(MT5_HIGHER_TIMEFRAME_SOURCES_KEY, JSON.stringify(saved));
  }
  publish(saved);
  return saved;
};

export async function fetchAndStoreMt5HigherTimeframeSources({
  brokerSymbol,
  limit,
  requestedSymbol,
  timeframes
}: {
  brokerSymbol?: string;
  limit?: number;
  requestedSymbol?: string;
  timeframes?: string[];
}) {
  const settings = loadMt5ReadOnlySettings();
  const resolvedRequestedSymbol = (requestedSymbol || settings.requestedSymbol || "MNQ").trim();
  const resolvedBrokerSymbol = (brokerSymbol || settings.brokerSymbolOverride || "USTECH").trim();
  const resolvedLimit = Math.max(1, Math.min(5000, Number(limit ?? settings.candleLimit ?? 1000)));
  const selectedTimeframes = sanitizeMt5HigherTimeframes(timeframes ?? settings.higherTimeframes);
  const existing = loadMt5HigherTimeframeSourceSummaries().filter(
    (source) => source.requestedSymbol !== resolvedRequestedSymbol || source.brokerSymbol !== resolvedBrokerSymbol
  );
  const fetched: Mt5HigherTimeframeSourceSummary[] = [];

  for (const timeframeInput of selectedTimeframes) {
    const timeframe = sanitizeMt5ReadOnlyTimeframe(timeframeInput) as Timeframe;
    const candlesResponse = await fetchMt5ReadOnlyCandles(
      {
        brokerSymbol: resolvedBrokerSymbol,
        limit: resolvedLimit,
        symbol: resolvedRequestedSymbol,
        timeframe
      },
      settings
    );
    const feed = createActiveMt5ReadOnlyCandleFeed({
      candlesResponse,
      gotraderSymbol: resolvedRequestedSymbol,
      gotraderTimeframe: timeframe,
      usageMode: "chart_only"
    });
    const candles = mt5ReadOnlyCandlesToGoTraderCandles(feed);
    const source = createCanonicalCandleSource({
      candles,
      provider: "mt5_read_only",
      providerSymbol: feed.brokerSymbol,
      roles: ["available"],
      sourceId: `mt5_read_only:${resolvedRequestedSymbol}:${resolvedBrokerSymbol}:${timeframe}:context`,
      sourceLabel: `MT5 read-only ${timeframe} higher-timeframe context - no execution authority`,
      storageBackend: "indexeddb",
      symbol: resolvedRequestedSymbol,
      timeframe,
      symbolMatches: feed.researchEligibility.symbolMatch,
      timeframeMatches: feed.researchEligibility.timeframeMatch,
      userSelectedForResearch: false,
      warnings: [
        mt5CfdProxyWarning(resolvedBrokerSymbol, resolvedRequestedSymbol),
        "Higher-timeframe source is context only until deterministic research explicitly consumes it."
      ],
      fetchedAt: feed.fetchedAt
    });
    await saveCanonicalCandleSource(source);
    fetched.push({
      provider: "mt5_read_only",
      requestedSymbol: resolvedRequestedSymbol,
      brokerSymbol: feed.brokerSymbol ?? resolvedBrokerSymbol,
      timeframe,
      candleCount: feed.candleCount,
      firstTimestamp: feed.firstTimestamp,
      lastTimestamp: feed.lastTimestamp,
      lastClose: feed.lastClose,
      fingerprint: source.fingerprint || feed.candleFingerprint || buildMt5ReadOnlyCandleFingerprint(feed.candles),
      eligibilityState: feed.researchEligibility.state,
      storageBackend: "indexeddb",
      fetchedAt: feed.fetchedAt,
      warning: feed.candleCount ? undefined : candlesResponse.missingEvidence.join(" ") || "No MT5 higher-timeframe candles returned."
    });
  }

  return saveMt5HigherTimeframeSourceSummaries([...existing, ...fetched]);
}
