import type {
  ActiveMt5ReadOnlyCandleFeed,
  Mt5ReadOnlyCandleFeedMetadata,
  Mt5ReadOnlyCandleFeedRecord,
  Mt5ReadOnlyCandlesResponse,
  Mt5ReadOnlyQuote,
  Mt5ReadOnlySettings,
  Mt5ReadOnlyStatus
} from "@/lib/integrations/mt5/mt5ReadOnlyTypes";
import {
  createActiveMt5ReadOnlyCandleFeed,
  evaluateMt5ReadOnlyResearchEligibility
} from "@/lib/integrations/mt5/mt5ReadOnlyNormalizer";

const REQUEST_TIMEOUT_MS = 5000;
const DB_NAME = "gotrader-ai-lab-mt5-readonly";
const DB_VERSION = 1;
const FEEDS_STORE = "gotrader_mt5_readonly_feeds";
const SETTINGS_KEY = "gotrader-ai-lab-mt5-readonly-settings";
const STATUS_KEY = "gotrader-ai-lab-mt5-readonly-status";
const FEED_METADATA_KEY = "gotrader-ai-lab-mt5-readonly-active-feed";

export const MT5_READ_ONLY_UPDATED_EVENT = "gotrader-ai-lab-mt5-readonly-updated";
export const DEFAULT_MT5_READ_ONLY_BRIDGE_URL = "http://127.0.0.1:7341";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const hasIndexedDb = () => typeof indexedDB !== "undefined";
let activeFeedSessionCache: ActiveMt5ReadOnlyCandleFeed | undefined;

const publish = (detail?: unknown) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MT5_READ_ONLY_UPDATED_EVENT, { detail }));
  }
};

const defaultSettings: Mt5ReadOnlySettings = {
  bridgeUrl: DEFAULT_MT5_READ_ONLY_BRIDGE_URL,
  enabled: false,
  requestedSymbol: "MNQ",
  brokerSymbolOverride: "USTECH",
  timeframe: "5m",
  candleLimit: 1000
};

const sanitizeSettings = (settings: Partial<Mt5ReadOnlySettings> | null | undefined): Mt5ReadOnlySettings => ({
  ...defaultSettings,
  ...(settings ?? {}),
  bridgeUrl: (settings?.bridgeUrl || defaultSettings.bridgeUrl).replace(/\/$/, ""),
  requestedSymbol: (settings?.requestedSymbol || defaultSettings.requestedSymbol || "MNQ").trim(),
  brokerSymbolOverride: (settings?.brokerSymbolOverride || defaultSettings.brokerSymbolOverride || "USTECH").trim(),
  timeframe: (settings?.timeframe || defaultSettings.timeframe || "5m").trim(),
  candleLimit: Math.max(1, Number(settings?.candleLimit ?? defaultSettings.candleLimit ?? 1000))
});

export const loadMt5ReadOnlySettings = (): Mt5ReadOnlySettings => {
  if (!isBrowser()) {
    return defaultSettings;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Mt5ReadOnlySettings> | null;
    return sanitizeSettings(parsed);
  } catch {
    return defaultSettings;
  }
};

export const saveMt5ReadOnlySettings = (settings: Partial<Mt5ReadOnlySettings>): Mt5ReadOnlySettings => {
  const saved = sanitizeSettings({
    ...loadMt5ReadOnlySettings(),
    ...settings
  });
  if (isBrowser()) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    publish({ settings: saved });
  }
  return saved;
};

const disconnectedStatus = (message = "MT5 read-only bridge is disconnected."): Mt5ReadOnlyStatus => ({
  provider: "mt5_read_only",
  connectionStatus: "disconnected",
  endpoint: loadMt5ReadOnlySettings().bridgeUrl,
  message,
  warnings: [
    "No MT5 read-only HTTP bridge responded at the configured URL.",
    "MT5 execution, orders, positions, and account mutation remain unavailable."
  ],
  lastCheckedAt: new Date().toISOString(),
  ...authority
});

export const loadMt5ReadOnlyStatus = (): Mt5ReadOnlyStatus => {
  if (!isBrowser()) {
    return disconnectedStatus();
  }
  try {
    return JSON.parse(window.localStorage.getItem(STATUS_KEY) ?? "null") ?? disconnectedStatus();
  } catch {
    return disconnectedStatus();
  }
};

const storeStatus = (status: Mt5ReadOnlyStatus) => {
  if (isBrowser()) {
    window.localStorage.setItem(STATUS_KEY, JSON.stringify({ ...status, ...authority }));
    publish({ status });
  }
  return { ...status, ...authority };
};

const endpoint = (settings: Mt5ReadOnlySettings, path: string, params?: Record<string, string | number | undefined>) => {
  const url = new URL(`${settings.bridgeUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const selectedBrokerSymbol = (
  requestBrokerSymbol?: string,
  settingsBrokerSymbol?: string
) => requestBrokerSymbol?.trim() || settingsBrokerSymbol?.trim() || defaultSettings.brokerSymbolOverride;

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

const normalizeStatus = (payload: Partial<Mt5ReadOnlyStatus>, settings: Mt5ReadOnlySettings): Mt5ReadOnlyStatus => ({
  provider: "mt5_read_only",
  connectionStatus: payload.connectionStatus === "connected" || payload.connectionStatus === "degraded" || payload.connectionStatus === "planned" || payload.connectionStatus === "error"
    ? payload.connectionStatus
    : "disconnected",
  endpoint: payload.endpoint ?? settings.bridgeUrl,
  message: payload.message ?? "MT5 read-only bridge status checked.",
  warnings: [
    ...(payload.warnings ?? []),
    "MT5 read-only authority only; no order/account mutation is permitted."
  ],
  lastCheckedAt: payload.lastCheckedAt ?? new Date().toISOString(),
  ...authority
});

const normalizeConnectionStatus = (
  status: unknown,
  fallback: Mt5ReadOnlyStatus["connectionStatus"] = "disconnected"
): Mt5ReadOnlyStatus["connectionStatus"] =>
  status === "connected" ||
  status === "degraded" ||
  status === "planned" ||
  status === "error" ||
  status === "disconnected"
    ? status
    : fallback;

export async function checkMt5ReadOnlyStatus(settings: Mt5ReadOnlySettings = loadMt5ReadOnlySettings()) {
  try {
    const payload = await fetchJson<Partial<Mt5ReadOnlyStatus>>(endpoint(settings, "status"));
    return storeStatus(normalizeStatus(payload, settings));
  } catch {
    return storeStatus(disconnectedStatus(`MT5 read-only bridge did not respond at ${settings.bridgeUrl}.`));
  }
}

export async function fetchMt5ReadOnlyQuote(
  request: { symbol: string; brokerSymbol?: string },
  settings: Mt5ReadOnlySettings = loadMt5ReadOnlySettings()
): Promise<Mt5ReadOnlyQuote> {
  const brokerSymbol = selectedBrokerSymbol(request.brokerSymbol, settings.brokerSymbolOverride);
  try {
    const payload = await fetchJson<Partial<Mt5ReadOnlyQuote>>(
      endpoint(settings, "quote", { requestedSymbol: request.symbol, symbol: brokerSymbol })
    );
    const bid = typeof payload.bid === "number" ? payload.bid : undefined;
    const ask = typeof payload.ask === "number" ? payload.ask : undefined;
    const upstreamMid = typeof payload.mid === "number" ? payload.mid : undefined;
    const mid = upstreamMid && upstreamMid > 0 ? upstreamMid : bid !== undefined && ask !== undefined ? (bid + ask) / 2 : upstreamMid;
    const spread = typeof payload.spread === "number" ? payload.spread : bid !== undefined && ask !== undefined ? ask - bid : undefined;
    return {
      provider: "mt5_read_only",
      symbol: payload.symbol ?? brokerSymbol ?? request.symbol,
      requestedSymbol: payload.requestedSymbol ?? request.symbol,
      brokerSymbol: payload.brokerSymbol ?? brokerSymbol,
      bid,
      ask,
      mid,
      spread,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      connectionStatus: normalizeConnectionStatus(payload.connectionStatus, bid !== undefined || ask !== undefined ? "connected" : "disconnected"),
      warnings: [
        ...(payload.warnings ?? []),
        "MT5 quote is read-only market data and not execution authority."
      ],
      missingEvidence: payload.missingEvidence ?? [],
      ...authority
    };
  } catch {
    return {
      provider: "mt5_read_only",
      symbol: brokerSymbol ?? request.symbol,
      requestedSymbol: request.symbol,
      brokerSymbol,
      connectionStatus: "disconnected",
      warnings: ["MT5 read-only quote endpoint is unavailable."],
      missingEvidence: [`No read-only quote returned from ${settings.bridgeUrl}.`],
      ...authority
    };
  }
}

export async function fetchMt5ReadOnlySymbols(settings: Mt5ReadOnlySettings = loadMt5ReadOnlySettings()) {
  try {
    const payload = await fetchJson<{
      connectionStatus?: Mt5ReadOnlyStatus["connectionStatus"];
      symbols?: unknown[];
      warnings?: string[];
      missingEvidence?: string[];
    }>(endpoint(settings, "symbols"));
    const symbols = (payload.symbols ?? [])
      .map((item) => (typeof item === "object" && item !== null ? (item as { symbol?: unknown; name?: unknown }).symbol ?? (item as { name?: unknown }).name : item))
      .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
      .map((item) => String(item))
      .filter(Boolean);
    return {
      provider: "mt5_read_only" as const,
      connectionStatus: normalizeConnectionStatus(payload.connectionStatus, symbols.length ? "connected" : "degraded"),
      symbols,
      warnings: [
        ...(payload.warnings ?? []),
        "MT5 symbols are read-only metadata and expose no execution authority."
      ],
      missingEvidence: payload.missingEvidence ?? [],
      ...authority
    };
  } catch {
    return {
      provider: "mt5_read_only" as const,
      connectionStatus: "disconnected" as const,
      symbols: [] as string[],
      warnings: ["MT5 read-only symbols endpoint is unavailable."],
      missingEvidence: [`No read-only symbols returned from ${settings.bridgeUrl}.`],
      ...authority
    };
  }
}

const disconnectedCandles = (
  request: { symbol: string; timeframe: string; limit?: number; brokerSymbol?: string },
  settings: Mt5ReadOnlySettings
): Mt5ReadOnlyCandlesResponse => ({
  provider: "mt5_read_only",
  symbol: selectedBrokerSymbol(request.brokerSymbol, settings.brokerSymbolOverride) || request.symbol,
  requestedSymbol: request.symbol,
  brokerSymbol: selectedBrokerSymbol(request.brokerSymbol, settings.brokerSymbolOverride),
  timeframe: request.timeframe,
  requestedTimeframe: request.timeframe,
  requestedLimit: Math.max(1, request.limit ?? 240),
  returnedCount: 0,
  candles: [],
  connectionStatus: "disconnected",
  depthStatus: "disconnected",
  warnings: ["MT5 read-only candle endpoint is disconnected."],
  missingEvidence: [`Start or configure a local MT5 read-only HTTP bridge at ${settings.bridgeUrl}.`],
  ...authority
});

export async function fetchMt5ReadOnlyCandles(
  request: { symbol: string; timeframe: string; limit?: number; brokerSymbol?: string },
  settings: Mt5ReadOnlySettings = loadMt5ReadOnlySettings()
): Promise<Mt5ReadOnlyCandlesResponse> {
  const brokerSymbol = selectedBrokerSymbol(request.brokerSymbol, settings.brokerSymbolOverride);
  try {
    const payload = await fetchJson<Partial<Mt5ReadOnlyCandlesResponse>>(
      endpoint(settings, "candles", {
        requestedSymbol: request.symbol,
        symbol: brokerSymbol,
        timeframe: request.timeframe,
        limit: Math.max(1, Math.min(5000, request.limit ?? 240))
      })
    );
    const candles = Array.isArray(payload.candles) ? payload.candles : [];
    return {
      provider: "mt5_read_only",
      symbol: payload.symbol ?? brokerSymbol ?? request.symbol,
      requestedSymbol: request.symbol,
      brokerSymbol: payload.brokerSymbol ?? brokerSymbol,
      timeframe: payload.timeframe ?? request.timeframe,
      requestedTimeframe: payload.requestedTimeframe ?? request.timeframe,
      requestedLimit: payload.requestedLimit ?? Math.max(1, request.limit ?? 240),
      returnedCount: payload.returnedCount ?? candles.length,
      candles,
      firstTimestamp: payload.firstTimestamp,
      lastTimestamp: payload.lastTimestamp,
      sourceMethod: payload.sourceMethod ?? "GET /candles",
      connectionStatus: payload.connectionStatus === "connected" || payload.connectionStatus === "degraded" ? payload.connectionStatus : candles.length ? "connected" : "disconnected",
      depthStatus: payload.depthStatus ?? (candles.length >= (request.limit ?? 240) ? "full" : candles.length ? "partial" : "insufficient_history"),
      warnings: [
        ...(payload.warnings ?? []),
        "MT5 candles are read-only market data and have no execution authority."
      ],
      missingEvidence: payload.missingEvidence ?? [],
      ...authority
    };
  } catch {
    return disconnectedCandles(request, settings);
  }
}

export async function fetchAndStoreMt5ReadOnlyCandleFeed({
  brokerSymbol,
  gotraderSymbol,
  gotraderTimeframe,
  limit = 240,
  settings,
  symbol,
  timeframe,
  usageMode = "chart_only"
}: {
  brokerSymbol?: string;
  gotraderSymbol?: string;
  gotraderTimeframe?: string;
  limit?: number;
  settings?: Mt5ReadOnlySettings;
  symbol: string;
  timeframe: string;
  usageMode?: "chart_only" | "research_source";
}): Promise<ActiveMt5ReadOnlyCandleFeed> {
  const bridgeSettings = settings ?? loadMt5ReadOnlySettings();
  const quote = await fetchMt5ReadOnlyQuote({ symbol, brokerSymbol }, bridgeSettings);
  const candlesResponse = await fetchMt5ReadOnlyCandles({ symbol, timeframe, limit, brokerSymbol }, bridgeSettings);
  const feed = createActiveMt5ReadOnlyCandleFeed({
    candlesResponse,
    gotraderSymbol: gotraderSymbol ?? symbol,
    gotraderTimeframe: gotraderTimeframe ?? timeframe,
    latestQuote: quote,
    usageMode
  });
  return storeActiveMt5ReadOnlyCandleFeed(feed);
}

const metadataFromFeed = (
  feed: ActiveMt5ReadOnlyCandleFeed,
  patch: Partial<Mt5ReadOnlyCandleFeedMetadata> = {}
): Mt5ReadOnlyCandleFeedMetadata => {
  const { candles: _candles, ...metadata } = feed;
  return {
    ...metadata,
    firstClose: feed.firstClose ?? feed.candles[0]?.close,
    lastClose: feed.lastClose ?? feed.candles[feed.candles.length - 1]?.close,
    storageBackend: feed.storageBackend ?? "session",
    candlesPersisted: Boolean(feed.candlesPersisted),
    storageWarnings: feed.storageWarnings ?? [],
    ...patch
  };
};

const feedFromMetadata = (
  metadata: Mt5ReadOnlyCandleFeedMetadata,
  candles: ActiveMt5ReadOnlyCandleFeed["candles"] = []
): ActiveMt5ReadOnlyCandleFeed => {
  const sourceLabel = metadata.sourceLabel ?? "MT5 read-only candle feed - no execution authority";
  const researchEligibility =
    metadata.researchEligibility ??
    evaluateMt5ReadOnlyResearchEligibility({
      candles,
      connectionStatus: metadata.connectionStatus ?? (candles.length ? "connected" : "disconnected"),
      matchState: metadata.matchState ?? "unavailable",
      sourceLabel
    });
  const usageMode = metadata.usageMode ?? "chart_only";
  return {
    ...metadata,
    candles,
    candleCount: candles.length || metadata.candleCount || 0,
    firstTimestamp: candles[0]?.timestamp ?? metadata.firstTimestamp,
    lastTimestamp: candles[candles.length - 1]?.timestamp ?? metadata.lastTimestamp,
    latestClose: candles[candles.length - 1]?.close ?? metadata.latestClose,
    usageMode,
    researchEligibility,
    activeForChart: Boolean(candles.length),
    activeForResearch: usageMode === "research_source" && researchEligibility.state === "eligible_for_research_cycle",
    sourceLabel,
    storageBackend: candles.length ? metadata.storageBackend : "metadata_only",
    candlesPersisted: metadata.candlesPersisted,
    storageWarnings: metadata.storageWarnings ?? [],
    ...authority
  };
};

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!isBrowser() || !hasIndexedDb()) {
      reject(new Error("IndexedDB is unavailable for MT5 read-only candles."));
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
    request.onerror = () => reject(request.error ?? new Error("Unable to open MT5 read-only candle store."));
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("MT5 read-only IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("MT5 read-only IndexedDB transaction aborted."));
  });

const idbRequest = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("MT5 read-only IndexedDB request failed."));
  });

const writeMetadata = (metadata: Mt5ReadOnlyCandleFeedMetadata) => {
  if (isBrowser()) {
    window.localStorage.setItem(FEED_METADATA_KEY, JSON.stringify(metadata));
  }
};

const loadMetadata = (): Mt5ReadOnlyCandleFeedMetadata | undefined => {
  if (!isBrowser()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FEED_METADATA_KEY) ?? "null") as Mt5ReadOnlyCandleFeedMetadata | null;
    return parsed?.provider === "mt5_read_only" ? parsed : undefined;
  } catch {
    window.localStorage.removeItem(FEED_METADATA_KEY);
    return undefined;
  }
};

async function persistFeed(feed: ActiveMt5ReadOnlyCandleFeed): Promise<ActiveMt5ReadOnlyCandleFeed> {
  const metadata = metadataFromFeed(feed, {
    storageBackend: "indexeddb",
    candlesPersisted: true
  });
  const record: Mt5ReadOnlyCandleFeedRecord = {
    feedId: feed.feedId,
    metadata,
    candles: feed.candles,
    fetchedAt: feed.fetchedAt
  };
  const db = await openDb();
  const tx = db.transaction(FEEDS_STORE, "readwrite");
  tx.objectStore(FEEDS_STORE).put(record);
  await txDone(tx);
  db.close();
  const persisted = feedFromMetadata(metadata, feed.candles);
  activeFeedSessionCache = persisted;
  writeMetadata(metadata);
  return persisted;
}

async function loadRecord(feedId: string): Promise<Mt5ReadOnlyCandleFeedRecord | undefined> {
  const db = await openDb();
  const tx = db.transaction(FEEDS_STORE, "readonly");
  const record = await idbRequest<Mt5ReadOnlyCandleFeedRecord | undefined>(tx.objectStore(FEEDS_STORE).get(feedId));
  await txDone(tx);
  db.close();
  return record;
}

export function loadActiveMt5ReadOnlyCandleFeed(): ActiveMt5ReadOnlyCandleFeed | undefined {
  const metadata = loadMetadata();
  if (!metadata) {
    return undefined;
  }
  if (activeFeedSessionCache?.feedId === metadata.feedId && activeFeedSessionCache.candles.length) {
    return activeFeedSessionCache;
  }
  return feedFromMetadata(metadata);
}

export async function hydrateActiveMt5ReadOnlyCandleFeed(): Promise<ActiveMt5ReadOnlyCandleFeed | undefined> {
  const metadata = loadMetadata();
  if (!metadata) {
    return undefined;
  }
  if (activeFeedSessionCache?.feedId === metadata.feedId && activeFeedSessionCache.candles.length) {
    return activeFeedSessionCache;
  }
  try {
    const record = await loadRecord(metadata.feedId);
    if (!record?.candles?.length) {
      return feedFromMetadata(metadata);
    }
    const feed = feedFromMetadata({ ...record.metadata, ...metadata }, record.candles);
    activeFeedSessionCache = feed;
    publish(feed);
    return feed;
  } catch {
    return feedFromMetadata({
      ...metadata,
      storageBackend: "metadata_only",
      storageWarnings: [
        ...metadata.storageWarnings,
        "MT5 read-only candles could not be loaded from IndexedDB; using metadata only."
      ]
    });
  }
}

export async function storeActiveMt5ReadOnlyCandleFeed(feed: ActiveMt5ReadOnlyCandleFeed) {
  if (!isBrowser()) {
    return feed;
  }
  activeFeedSessionCache = {
    ...feed,
    storageBackend: "session",
    candlesPersisted: false,
    storageWarnings: feed.storageWarnings ?? []
  };
  writeMetadata(metadataFromFeed(activeFeedSessionCache));
  try {
    const persisted = await persistFeed(activeFeedSessionCache);
    publish(persisted);
    return persisted;
  } catch {
    const sessionOnlyFeed = {
      ...activeFeedSessionCache,
      storageBackend: "session" as const,
      candlesPersisted: false,
      storageWarnings: [
        ...activeFeedSessionCache.storageWarnings,
        "MT5 read-only candles could not be persisted; using session-only chart data."
      ]
    };
    activeFeedSessionCache = sessionOnlyFeed;
    writeMetadata(metadataFromFeed(sessionOnlyFeed));
    publish(sessionOnlyFeed);
    return sessionOnlyFeed;
  }
}

export function updateActiveMt5ReadOnlyCandleFeedMetadata(
  feed: ActiveMt5ReadOnlyCandleFeed,
  patch: Partial<Mt5ReadOnlyCandleFeedMetadata>
) {
  const updatedFeed = feedFromMetadata(metadataFromFeed(feed, patch), feed.candles);
  activeFeedSessionCache = updatedFeed;
  writeMetadata(metadataFromFeed(updatedFeed));
  publish(updatedFeed);
  return updatedFeed;
}

export async function clearMt5ReadOnlyCandleFeedCache() {
  const metadata = loadMetadata();
  activeFeedSessionCache = undefined;
  if (isBrowser()) {
    window.localStorage.removeItem(FEED_METADATA_KEY);
  }
  if (metadata?.feedId && isBrowser() && hasIndexedDb()) {
    const db = await openDb();
    const tx = db.transaction(FEEDS_STORE, "readwrite");
    tx.objectStore(FEEDS_STORE).delete(metadata.feedId);
    await txDone(tx);
    db.close();
  }
  publish();
}
