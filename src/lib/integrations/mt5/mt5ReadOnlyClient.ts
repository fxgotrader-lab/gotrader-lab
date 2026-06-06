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
import {
  normalizeAndDeduplicateCandles,
  summarizeHistoryDepth,
  type Mt5ReadOnlyDepthSummary
} from "@/lib/integrations/mt5/mt5ReadOnlyDepth";
import {
  displayLabelForMt5Mapping,
  findDefaultMt5SymbolMapping,
  sanitizeMt5HigherTimeframes,
  sanitizeMt5ReadOnlyTimeframe
} from "@/lib/integrations/mt5/mt5SymbolSettings";

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
  displayLabel: "MNQ via USTECH",
  timeframe: "5m",
  higherTimeframes: ["15m", "1h"],
  candleLimit: 1000
};

const sanitizeSettings = (settings: Partial<Mt5ReadOnlySettings> | null | undefined): Mt5ReadOnlySettings => {
  const requestedSymbol = (settings?.requestedSymbol || defaultSettings.requestedSymbol || "MNQ").trim();
  const defaultMapping = findDefaultMt5SymbolMapping(requestedSymbol);
  const brokerSymbolOverride = (settings?.brokerSymbolOverride || defaultMapping.brokerSymbol || defaultSettings.brokerSymbolOverride || "USTECH").trim();
  return {
    ...defaultSettings,
    ...(settings ?? {}),
    bridgeUrl: (settings?.bridgeUrl || defaultSettings.bridgeUrl).replace(/\/$/, ""),
    requestedSymbol,
    brokerSymbolOverride,
    displayLabel: displayLabelForMt5Mapping({
      brokerSymbol: brokerSymbolOverride,
      displayLabel: settings?.displayLabel,
      requestedSymbol
    }),
    timeframe: sanitizeMt5ReadOnlyTimeframe(settings?.timeframe || defaultSettings.timeframe || "5m"),
    higherTimeframes: sanitizeMt5HigherTimeframes(settings?.higherTimeframes ?? defaultSettings.higherTimeframes),
    candleLimit: Math.max(1, Number(settings?.candleLimit ?? defaultSettings.candleLimit ?? 1000))
  };
};

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

export interface Mt5ReadOnlyDateRangeRequest {
  brokerSymbol?: string;
  from: string;
  limit?: number;
  symbol: string;
  timeframe: string;
  to: string;
}

export interface Mt5ReadOnlyChunkedHistoryRequest {
  brokerSymbol?: string;
  chunkDays?: number;
  from?: string;
  limitPerChunk?: number;
  lookbackDays?: number;
  symbol: string;
  timeframe: string;
  to?: string;
}

export interface Mt5ReadOnlyHistoryChunk {
  from: string;
  to: string;
  returnedCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  connectionStatus: Mt5ReadOnlyCandlesResponse["connectionStatus"];
  depthStatus: Mt5ReadOnlyCandlesResponse["depthStatus"];
  sourceMethod?: string;
  warnings: string[];
  missingEvidence: string[];
}

export interface Mt5ReadOnlyChunkedHistoryResult {
  provider: "mt5_read_only";
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  requestedLookbackDays: number;
  candles: Mt5ReadOnlyCandlesResponse["candles"];
  chunks: Mt5ReadOnlyHistoryChunk[];
  summary: Mt5ReadOnlyDepthSummary;
  warnings: string[];
  missingEvidence: string[];
  authority: typeof authority;
}

const parseDateOrUndefined = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const dateRangeWindows = ({
  chunkDays,
  from,
  lookbackDays,
  to
}: {
  chunkDays: number;
  from?: string;
  lookbackDays: number;
  to?: string;
}) => {
  const end = parseDateOrUndefined(to) ?? new Date();
  const start = parseDateOrUndefined(from) ?? new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const chunkMillis = Math.max(1, chunkDays) * 24 * 60 * 60 * 1000;
  const windows: Array<{ from: string; to: string }> = [];
  let cursor = start.getTime();
  const endTime = end.getTime();
  while (cursor < endTime && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, endTime);
    windows.push({
      from: new Date(cursor).toISOString(),
      to: new Date(next).toISOString()
    });
    cursor = next;
  }
  return windows;
};

export async function fetchMt5CandlesByDateRange(
  request: Mt5ReadOnlyDateRangeRequest,
  settings: Mt5ReadOnlySettings = loadMt5ReadOnlySettings()
): Promise<Mt5ReadOnlyCandlesResponse> {
  const brokerSymbol = selectedBrokerSymbol(request.brokerSymbol, settings.brokerSymbolOverride);
  const safeLimit = Math.max(1, Math.min(5000, request.limit ?? 5000));
  try {
    const payload = await fetchJson<Partial<Mt5ReadOnlyCandlesResponse>>(
      endpoint(settings, "candles/range", {
        requestedSymbol: request.symbol,
        symbol: brokerSymbol,
        timeframe: request.timeframe,
        from: request.from,
        to: request.to,
        limit: safeLimit
      })
    );
    const candles = normalizeAndDeduplicateCandles(Array.isArray(payload.candles) ? payload.candles : []);
    return {
      provider: "mt5_read_only",
      symbol: payload.symbol ?? brokerSymbol ?? request.symbol,
      requestedSymbol: payload.requestedSymbol ?? request.symbol,
      brokerSymbol: payload.brokerSymbol ?? brokerSymbol,
      timeframe: payload.timeframe ?? request.timeframe,
      requestedTimeframe: payload.requestedTimeframe ?? request.timeframe,
      requestedLimit: payload.requestedLimit ?? safeLimit,
      returnedCount: payload.returnedCount ?? candles.length,
      candles,
      firstTimestamp: payload.firstTimestamp ?? candles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? candles[candles.length - 1]?.timestamp,
      sourceMethod: payload.sourceMethod ?? "GET /candles/range",
      connectionStatus: normalizeConnectionStatus(payload.connectionStatus, candles.length ? "connected" : "degraded"),
      depthStatus: payload.depthStatus ?? (candles.length >= safeLimit ? "capped_by_provider" : candles.length ? "partial" : "insufficient_history"),
      warnings: [
        ...(payload.warnings ?? []),
        "MT5 date-range candles are explicit read-only diagnostics and have no execution authority."
      ],
      missingEvidence: payload.missingEvidence ?? [],
      ...authority
    };
  } catch {
    return {
      ...disconnectedCandles({ symbol: request.symbol, timeframe: request.timeframe, limit: safeLimit, brokerSymbol }, settings),
      sourceMethod: "GET /candles/range",
      warnings: ["MT5 read-only date-range candle endpoint is unavailable."],
      missingEvidence: [
        `The running wrapper at ${settings.bridgeUrl} did not provide a usable /candles/range response. Restart/update the wrapper or configure MT5_READONLY_UPSTREAM_CANDLES_RANGE_PATH.`
      ]
    };
  }
}

export async function fetchMt5CandlesInChunks(
  request: Mt5ReadOnlyChunkedHistoryRequest,
  settings: Mt5ReadOnlySettings = loadMt5ReadOnlySettings()
): Promise<Mt5ReadOnlyChunkedHistoryResult> {
  const brokerSymbol = selectedBrokerSymbol(request.brokerSymbol, settings.brokerSymbolOverride) ?? request.symbol;
  const requestedLookbackDays = Math.max(1, request.lookbackDays ?? 90);
  const chunkDays = Math.max(1, request.chunkDays ?? 10);
  const limitPerChunk = Math.max(1, Math.min(5000, request.limitPerChunk ?? 5000));
  const windows = dateRangeWindows({
    chunkDays,
    from: request.from,
    lookbackDays: requestedLookbackDays,
    to: request.to
  });
  const chunks: Mt5ReadOnlyHistoryChunk[] = [];
  const candles: Mt5ReadOnlyCandlesResponse["candles"] = [];
  for (const window of windows) {
    const response = await fetchMt5CandlesByDateRange({
      brokerSymbol,
      from: window.from,
      limit: limitPerChunk,
      symbol: request.symbol,
      timeframe: request.timeframe,
      to: window.to
    }, settings);
    chunks.push({
      from: window.from,
      to: window.to,
      returnedCount: response.returnedCount,
      firstTimestamp: response.firstTimestamp,
      lastTimestamp: response.lastTimestamp,
      connectionStatus: response.connectionStatus,
      depthStatus: response.depthStatus,
      sourceMethod: response.sourceMethod,
      warnings: response.warnings,
      missingEvidence: response.missingEvidence
    });
    candles.push(...response.candles);
    if (!response.candles.length && response.connectionStatus === "disconnected") {
      break;
    }
  }
  const normalized = normalizeAndDeduplicateCandles(candles);
  const failedRange = chunks.find((chunk) => !chunk.returnedCount && chunk.missingEvidence.length)?.missingEvidence[0];
  const summary = summarizeHistoryDepth({
    brokerSymbol,
    candles: normalized,
    chunkCount: chunks.length,
    chunkingStatus: normalized.length ? "chunked_cached" : "not_supported_by_wrapper",
    limitationReason: normalized.length ? undefined : failedRange,
    requestedLookbackDays,
    requestedSymbol: request.symbol,
    timeframe: request.timeframe
  });
  return {
    provider: "mt5_read_only",
    requestedSymbol: request.symbol,
    brokerSymbol,
    timeframe: request.timeframe,
    requestedLookbackDays,
    candles: normalized,
    chunks,
    summary,
    warnings: summary.warnings,
    missingEvidence: summary.missingEvidence,
    authority
  };
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

export async function storeActiveMt5ReadOnlyCandleFeed(
  feed: ActiveMt5ReadOnlyCandleFeed,
  options: { persist?: boolean } = {}
) {
  if (!isBrowser()) {
    return feed;
  }
  const shouldPersist = options.persist !== false;
  activeFeedSessionCache = {
    ...feed,
    storageBackend: "session",
    candlesPersisted: false,
    storageWarnings: feed.storageWarnings ?? []
  };
  writeMetadata(metadataFromFeed(activeFeedSessionCache));
  if (!shouldPersist) {
    publish(activeFeedSessionCache);
    return activeFeedSessionCache;
  }
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
