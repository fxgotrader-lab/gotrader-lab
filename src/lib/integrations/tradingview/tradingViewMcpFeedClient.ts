import type {
  ActiveTradingViewMcpChartFeed,
  TradingViewMcpChartFeedMetadata,
  TradingViewMcpChartFeedRecord,
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
const DB_NAME = "gotrader-ai-lab-tradingview-mcp";
const DB_VERSION = 1;
const FEEDS_STORE = "gotrader_tradingview_mcp_feeds";
const defaultAuthority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const hasIndexedDb = () => typeof indexedDB !== "undefined";
let activeFeedSessionCache: ActiveTradingViewMcpChartFeed | undefined;

const openTradingViewFeedDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!isBrowser() || !hasIndexedDb()) {
      reject(new Error("IndexedDB is unavailable for TradingView MCP candles."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FEEDS_STORE)) {
        db.createObjectStore(FEEDS_STORE, { keyPath: "feedId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open TradingView MCP candle store."));
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("TradingView MCP IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("TradingView MCP IndexedDB transaction aborted."));
  });

const idbRequest = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("TradingView MCP IndexedDB request failed."));
  });

const publishFeedEvent = (detail?: unknown) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, { detail }));
  }
};

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

const metadataFromFeed = (
  feed: ActiveTradingViewMcpChartFeed,
  patch: Partial<TradingViewMcpChartFeedMetadata> = {}
): TradingViewMcpChartFeedMetadata => {
  const { candles: _candles, ...metadata } = feed;
  return {
    ...metadata,
    firstClose: feed.firstClose ?? feed.candles[0]?.close,
    lastClose: feed.lastClose ?? feed.candles[feed.candles.length - 1]?.close,
    fetchedAt: feed.fetchedAt ?? feed.storedAt,
    storageBackend: feed.storageBackend ?? "session",
    candlesPersisted: Boolean(feed.candlesPersisted),
    storageWarnings: feed.storageWarnings ?? [],
    ...patch
  };
};

const feedFromMetadata = (
  metadata: TradingViewMcpChartFeedMetadata,
  candles: ActiveTradingViewMcpChartFeed["candles"] = []
): ActiveTradingViewMcpChartFeed => {
  const sourceLabel = metadata.sourceLabel ?? "TradingView MCP chart feed - read-only, not broker truth";
  const researchEligibility =
    metadata.researchEligibility ??
    evaluateTradingViewMcpResearchEligibility({
      candles,
      connectionStatus: metadata.connectionStatus ?? (candles.length ? "connected_with_candles" : "disconnected"),
      matchState: metadata.matchState ?? "unavailable",
      sourceLabel
    });
  const usageMode = metadata.usageMode ?? "chart_only";
  const activeForResearch = usageMode === "research_source" && researchEligibility.state === "eligible_for_research_cycle";
  const feed: ActiveTradingViewMcpChartFeed = {
    ...metadata,
    candles,
    candleCount: candles.length || metadata.candleCount || 0,
    firstTimestamp: candles[0]?.timestamp ?? metadata.firstTimestamp,
    lastTimestamp: candles[candles.length - 1]?.timestamp ?? metadata.lastTimestamp,
    latestClose: candles[candles.length - 1]?.close ?? metadata.latestClose,
    firstClose: candles[0]?.close ?? metadata.firstClose,
    lastClose: candles[candles.length - 1]?.close ?? metadata.lastClose,
    usageMode,
    researchEligibility,
    activeForChart: Boolean(candles.length),
    activeForResearch,
    sourceLabel,
    storageBackend: candles.length ? metadata.storageBackend : "metadata_only",
    candlesPersisted: metadata.candlesPersisted,
    storageWarnings: metadata.storageWarnings ?? [],
    ...defaultAuthority
  };
  return feed;
};

const writeMetadataToLocalStorage = (metadata: TradingViewMcpChartFeedMetadata) => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY, JSON.stringify(metadata));
  } catch {
    // Metadata is small, but quota can still fail in constrained browsers. Keep the session cache alive.
  }
};

const migrateOrLoadMetadataFromLocalStorage = (): TradingViewMcpChartFeedMetadata | undefined => {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = window.localStorage.getItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveTradingViewMcpChartFeed> & Partial<TradingViewMcpChartFeedMetadata>;
    if (parsed.provider !== "tradingview_mcp" || parsed.executionAuthority !== "none") {
      return undefined;
    }
    if (Array.isArray(parsed.candles)) {
      const legacyFeed = feedFromMetadata(
        {
          ...(parsed as TradingViewMcpChartFeedMetadata),
          feedId: parsed.feedId ?? `tradingview_mcp_legacy_${Date.now().toString(36)}`,
          candlesPersisted: false,
          storageBackend: "session",
          storageWarnings: [
            ...(parsed.storageWarnings ?? []),
            "Migrated legacy TradingView MCP candle payload out of localStorage."
          ]
        },
        parsed.candles
      );
      activeFeedSessionCache = legacyFeed;
      const metadata = metadataFromFeed(legacyFeed, {
        storageBackend: "session",
        candlesPersisted: false,
        storageWarnings: legacyFeed.storageWarnings
      });
      writeMetadataToLocalStorage(metadata);
      void persistTradingViewMcpFeedToIndexedDb(legacyFeed).catch(() => undefined);
      return metadata;
    }
    return {
      ...(parsed as TradingViewMcpChartFeedMetadata),
      feedId: parsed.feedId ?? `tradingview_mcp_metadata_${Date.now().toString(36)}`,
      storageBackend: parsed.storageBackend ?? "metadata_only",
      candlesPersisted: Boolean(parsed.candlesPersisted),
      storageWarnings: parsed.storageWarnings ?? []
    };
  } catch {
    window.localStorage.removeItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY);
    return undefined;
  }
};

async function persistTradingViewMcpFeedToIndexedDb(feed: ActiveTradingViewMcpChartFeed): Promise<ActiveTradingViewMcpChartFeed> {
  const metadata = metadataFromFeed(feed, {
    storageBackend: "indexeddb",
    candlesPersisted: true,
    storageWarnings: feed.storageWarnings.filter((warning) => !warning.includes("could not be persisted"))
  });
  const record: TradingViewMcpChartFeedRecord = {
    feedId: feed.feedId,
    metadata,
    candles: feed.candles,
    fetchedAt: metadata.fetchedAt
  };
  const db = await openTradingViewFeedDb();
  const tx = db.transaction(FEEDS_STORE, "readwrite");
  tx.objectStore(FEEDS_STORE).put(record);
  await txDone(tx);
  db.close();
  const persisted = feedFromMetadata(metadata, feed.candles);
  activeFeedSessionCache = persisted;
  writeMetadataToLocalStorage(metadata);
  return persisted;
}

async function loadTradingViewMcpFeedRecord(feedId: string): Promise<TradingViewMcpChartFeedRecord | undefined> {
  const db = await openTradingViewFeedDb();
  const tx = db.transaction(FEEDS_STORE, "readonly");
  const record = await idbRequest<TradingViewMcpChartFeedRecord | undefined>(tx.objectStore(FEEDS_STORE).get(feedId));
  await txDone(tx);
  db.close();
  return record;
}

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
  return storeActiveTradingViewMcpChartFeed(feed);
}

export function loadActiveTradingViewMcpChartFeed(): ActiveTradingViewMcpChartFeed | undefined {
  const metadata = migrateOrLoadMetadataFromLocalStorage();
  if (!metadata) {
    return undefined;
  }
  if (activeFeedSessionCache?.feedId === metadata.feedId && activeFeedSessionCache.candles.length) {
    return activeFeedSessionCache;
  }
  return feedFromMetadata(metadata);
}

export async function hydrateActiveTradingViewMcpChartFeed(): Promise<ActiveTradingViewMcpChartFeed | undefined> {
  const metadata = migrateOrLoadMetadataFromLocalStorage();
  if (!metadata) {
    return undefined;
  }
  if (activeFeedSessionCache?.feedId === metadata.feedId && activeFeedSessionCache.candles.length) {
    return activeFeedSessionCache;
  }
  try {
    const record = await loadTradingViewMcpFeedRecord(metadata.feedId);
    if (!record?.candles?.length) {
      return feedFromMetadata(metadata);
    }
    const feed = feedFromMetadata(record.metadata, record.candles);
    activeFeedSessionCache = feed;
    publishFeedEvent(feed);
    return feed;
  } catch {
    return feedFromMetadata({
      ...metadata,
      storageBackend: "metadata_only",
      storageWarnings: [
        ...metadata.storageWarnings,
        "TradingView MCP candles could not be loaded from IndexedDB; using metadata only."
      ]
    });
  }
}

export function saveActiveTradingViewMcpChartFeed(feed: ActiveTradingViewMcpChartFeed) {
  if (!isBrowser()) {
    return feed;
  }
  const sessionFeed = {
    ...feed,
    storageBackend: "session" as const,
    candlesPersisted: false,
    storageWarnings: feed.storageWarnings ?? []
  };
  activeFeedSessionCache = sessionFeed;
  writeMetadataToLocalStorage(metadataFromFeed(sessionFeed));
  void persistTradingViewMcpFeedToIndexedDb(sessionFeed)
    .then((persisted) => publishFeedEvent(persisted))
    .catch(() => {
      const sessionOnlyFeed = {
        ...sessionFeed,
        storageBackend: "session" as const,
        candlesPersisted: false,
        storageWarnings: [
          ...sessionFeed.storageWarnings,
          "TradingView MCP candles could not be persisted; using session-only chart data."
        ]
      };
      activeFeedSessionCache = sessionOnlyFeed;
      writeMetadataToLocalStorage(metadataFromFeed(sessionOnlyFeed));
      publishFeedEvent(sessionOnlyFeed);
    });
  publishFeedEvent(sessionFeed);
  return sessionFeed;
}

export async function storeActiveTradingViewMcpChartFeed(feed: ActiveTradingViewMcpChartFeed) {
  if (!isBrowser()) {
    return feed;
  }
  activeFeedSessionCache = {
    ...feed,
    storageBackend: "session",
    candlesPersisted: false,
    storageWarnings: feed.storageWarnings ?? []
  };
  writeMetadataToLocalStorage(metadataFromFeed(activeFeedSessionCache));
  try {
    const persisted = await persistTradingViewMcpFeedToIndexedDb(activeFeedSessionCache);
    publishFeedEvent(persisted);
    return persisted;
  } catch {
    const sessionOnlyFeed = {
      ...activeFeedSessionCache,
      storageBackend: "session" as const,
      candlesPersisted: false,
      storageWarnings: [
        ...activeFeedSessionCache.storageWarnings,
        "TradingView MCP candles could not be persisted; using session-only chart data."
      ]
    };
    activeFeedSessionCache = sessionOnlyFeed;
    writeMetadataToLocalStorage(metadataFromFeed(sessionOnlyFeed));
    publishFeedEvent(sessionOnlyFeed);
    return sessionOnlyFeed;
  }
}

export function clearActiveTradingViewMcpChartFeed() {
  if (!isBrowser()) {
    return;
  }
  const metadata = migrateOrLoadMetadataFromLocalStorage();
  activeFeedSessionCache = undefined;
  window.localStorage.removeItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY);
  if (metadata?.feedId && hasIndexedDb()) {
    void openTradingViewFeedDb()
      .then(async (db) => {
        const tx = db.transaction(FEEDS_STORE, "readwrite");
        tx.objectStore(FEEDS_STORE).delete(metadata.feedId);
        await txDone(tx);
        db.close();
      })
      .catch(() => undefined);
  }
  publishFeedEvent();
}

export async function clearTradingViewMcpChartFeedCache() {
  activeFeedSessionCache = undefined;
  if (isBrowser()) {
    window.localStorage.removeItem(TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY);
  }
  if (isBrowser() && hasIndexedDb()) {
    const db = await openTradingViewFeedDb();
    const tx = db.transaction(FEEDS_STORE, "readwrite");
    tx.objectStore(FEEDS_STORE).clear();
    await txDone(tx);
    db.close();
  }
  publishFeedEvent();
}
