import type {
  ActiveTradingViewMcpChartFeed,
  TradingViewMcpCandlesResponse,
  TradingViewMcpFeedUsageMode,
  TradingViewMcpFeedRequest,
  TradingViewMcpQuoteResponse,
  TradingViewMcpSnapshotResponse
} from "@/lib/integrations/tradingview/tradingViewCandleFeedTypes";
import {
  TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY,
  TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT
} from "@/lib/integrations/tradingview/tradingViewCandleFeedTypes";
import {
  createActiveTradingViewMcpChartFeed,
  evaluateTradingViewMcpResearchEligibility
} from "@/lib/integrations/tradingview/tradingViewCandleNormalizer";
import type { TradingViewMcpBridgeSettings } from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";
import { loadTradingViewMcpSettings } from "@/lib/integrations/tradingview/tradingViewMcpSettings";

const REQUEST_TIMEOUT_MS = 10000;
const defaultAuthority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const endpoint = (settings: TradingViewMcpBridgeSettings, path: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${settings.bridgeUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const disconnectedCandles = (request: TradingViewMcpFeedRequest, error?: unknown): TradingViewMcpCandlesResponse => ({
  provider: "tradingview_mcp",
  symbol: request.symbol,
  requestedSymbol: request.symbol,
  timeframe: request.timeframe,
  requestedTimeframe: request.timeframe,
  candles: [],
  candleCount: 0,
  connectionStatus: "disconnected",
  warnings: ["TradingView MCP chart feed is disconnected."],
  missingEvidence: [
    "Start the local read-only TradingView MCP wrapper before requesting candles.",
    error ? `Fetch error: ${errorMessage(error)}` : undefined
  ].filter(Boolean) as string[],
  mode: "read_only_chart_data",
  ...defaultAuthority
});

export async function fetchTradingViewMcpQuote(
  request: TradingViewMcpFeedRequest,
  settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()
): Promise<TradingViewMcpQuoteResponse> {
  try {
    return await fetchJson<TradingViewMcpQuoteResponse>(
      endpoint(settings, "quote", { symbol: request.symbol, timeframe: request.timeframe })
    );
  } catch {
    return {
      provider: "tradingview_mcp",
      symbol: request.symbol,
      requestedSymbol: request.symbol,
      timeframe: request.timeframe,
      connectionStatus: "disconnected",
      warnings: ["TradingView MCP quote endpoint is unavailable."],
      missingEvidence: ["No read-only quote was returned."],
      mode: "read_only_chart_data",
      ...defaultAuthority
    };
  }
}

export async function fetchTradingViewMcpCandles(
  request: TradingViewMcpFeedRequest,
  settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()
): Promise<TradingViewMcpCandlesResponse> {
  try {
    return await fetchJson<TradingViewMcpCandlesResponse>(
      endpoint(settings, "candles", {
        symbol: request.symbol,
        timeframe: request.timeframe,
        limit: Math.max(1, Math.min(1000, request.limit ?? 240))
      })
    );
  } catch (error) {
    return disconnectedCandles(request, error);
  }
}

export async function fetchTradingViewMcpSnapshot(
  request: TradingViewMcpFeedRequest,
  settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()
): Promise<TradingViewMcpSnapshotResponse> {
  try {
    return await fetchJson<TradingViewMcpSnapshotResponse>(
      endpoint(settings, "snapshot", {
        symbol: request.symbol,
        timeframe: request.timeframe,
        limit: Math.max(1, Math.min(1000, request.limit ?? 240))
      })
    );
  } catch {
    return {
      quote: await fetchTradingViewMcpQuote(request, settings),
      candles: disconnectedCandles(request),
      mode: "read_only_chart_data",
      ...defaultAuthority
    };
  }
}

export async function fetchAndStoreTradingViewMcpChartFeed({
  gotraderSymbol,
  gotraderTimeframe,
  limit = 240,
  settings,
  symbol,
  timeframe,
  usageMode = "chart_only"
}: TradingViewMcpFeedRequest & {
  gotraderSymbol?: string;
  gotraderTimeframe?: string;
  settings?: TradingViewMcpBridgeSettings;
  usageMode?: TradingViewMcpFeedUsageMode;
}): Promise<ActiveTradingViewMcpChartFeed> {
  const bridgeSettings = settings ?? loadTradingViewMcpSettings();
  const candlesResponse = await fetchTradingViewMcpCandles({ symbol, timeframe, limit }, bridgeSettings);
  const feed = createActiveTradingViewMcpChartFeed({
    candlesResponse,
    gotraderSymbol: gotraderSymbol ?? symbol,
    gotraderTimeframe: gotraderTimeframe ?? timeframe,
    usageMode
  });
  saveActiveTradingViewMcpChartFeed(feed);
  return feed;
}

export function loadActiveTradingViewMcpChartFeed(): ActiveTradingViewMcpChartFeed | undefined {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = window.localStorage.getItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as ActiveTradingViewMcpChartFeed;
    if (parsed.provider !== "tradingview_mcp" || parsed.executionAuthority !== "none") {
      return undefined;
    }
    const sourceLabel = parsed.sourceLabel ?? "TradingView MCP chart feed - read-only, not broker truth";
    const researchEligibility =
      parsed.researchEligibility ??
      evaluateTradingViewMcpResearchEligibility({
        candles: parsed.candles ?? [],
        connectionStatus: parsed.connectionStatus ?? (parsed.candles?.length ? "connected_with_candles" : "disconnected"),
        matchState: parsed.matchState ?? "unavailable",
        sourceLabel
      });
    const usageMode = parsed.usageMode ?? "chart_only";
    return {
      ...parsed,
      usageMode,
      researchEligibility,
      activeForResearch: usageMode === "research_source" && researchEligibility.state === "eligible_for_research_cycle",
      sourceLabel
    };
  } catch {
    return undefined;
  }
}

export function saveActiveTradingViewMcpChartFeed(feed: ActiveTradingViewMcpChartFeed) {
  if (!isBrowser()) {
    return feed;
  }
  window.localStorage.setItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY, JSON.stringify(feed));
  window.dispatchEvent(new CustomEvent(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, { detail: feed }));
  return feed;
}

export function clearActiveTradingViewMcpChartFeed() {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT));
}
