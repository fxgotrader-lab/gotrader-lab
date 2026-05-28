import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FMP_REST_BASE_URL = "https://financialmodelingprep.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1000;
const DEFAULT_ECONOMIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SYMBOL_NEWS_CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_NEWS_ITEMS = 5;
const MAX_ECONOMIC_EVENTS = 10;
const OPENCLAW_MAX_MACRO_FLAGS = 3;

export const MARKET_CONTEXT_CONTRACT_VERSION = "gotrader_market_context_v1";
export const MARKET_CONTEXT_SENTIMENT_POLICY_VERSION = "market_context_context_only_v1";
export const DEFAULT_GOTRADER_MODE = "paper";

let envLoaded = false;
let lastRequestStartedAt = 0;
let rateLimitQueue = Promise.resolve();
const responseCache = new Map();

const impactRank = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0
};

function now() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) {
    return null;
  }
  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return key ? { key, value } : null;
}

export function loadFmpEnvironment({ cwd = process.cwd() } = {}) {
  if (envLoaded) {
    return;
  }
  for (const fileName of [".env.local", ".env"]) {
    const envPath = path.join(cwd, fileName);
    if (!fs.existsSync(envPath)) {
      continue;
    }
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
  envLoaded = true;
}

function getNumericEnv(name, fallbackValue) {
  loadFmpEnvironment();
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallbackValue;
}

export function getFmpEnvironmentStatus() {
  loadFmpEnvironment();
  const mode = process.env.GOTRADER_MODE || DEFAULT_GOTRADER_MODE;
  return {
    hasApiKey: Boolean(process.env.FMP_API_KEY),
    gotraderMode: mode,
    modeIsPaper: mode === "paper",
    requiredVariables: ["FMP_API_KEY", "GOTRADER_MODE=paper"]
  };
}

function success(data, meta = {}) {
  return {
    ok: true,
    data,
    ...meta
  };
}

function failure(code, message, details = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: ["network_failure", "timeout", "rate_limited", "server_error"].includes(code),
      ...details
    }
  };
}

function sanitizeUrl(url) {
  const safeUrl = new URL(url.toString());
  if (safeUrl.searchParams.has("apikey")) {
    safeUrl.searchParams.set("apikey", "[redacted]");
  }
  return safeUrl.toString();
}

function cacheKeyFor(endpoint, params) {
  return JSON.stringify({ endpoint, params });
}

function getCachedResponse(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function setCachedResponse(cacheKey, result, ttlMs) {
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    result
  });
}

async function throttleFmpRequests() {
  const minIntervalMs = getNumericEnv("FMP_MIN_REQUEST_INTERVAL_MS", DEFAULT_MIN_REQUEST_INTERVAL_MS);
  rateLimitQueue = rateLimitQueue
    .catch(() => undefined)
    .then(async () => {
      const elapsed = Date.now() - lastRequestStartedAt;
      const waitMs = Math.max(0, minIntervalMs - elapsed);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      lastRequestStartedAt = Date.now();
    });
  return rateLimitQueue;
}

function buildFmpUrl(endpoint, params = {}) {
  const url = new URL(endpoint, FMP_REST_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestFmp(endpoint, params = {}, options = {}) {
  loadFmpEnvironment();
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return failure("missing_api_key", "FMP_API_KEY is required for live FMP requests. Dry-run mode remains available.");
  }

  const ttlMs = options.cacheTtlMs ?? DEFAULT_NEWS_CACHE_TTL_MS;
  const cacheKey = cacheKeyFor(endpoint, params);
  if (ttlMs > 0 && !options.bypassCache) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return {
        ...cached,
        cache: "hit"
      };
    }
  }

  const url = buildFmpUrl(endpoint, params);
  const timeoutMs = options.timeoutMs ?? getNumericEnv("FMP_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await throttleFmpRequests();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: apiKey
      },
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : [];
    } catch {
      return failure("malformed_response", "FMP returned non-JSON content.", {
        httpStatus: response.status,
        endpoint,
        request: sanitizeUrl(url)
      });
    }
    if (!response.ok) {
      return failure(response.status === 429 ? "rate_limited" : response.status >= 500 ? "server_error" : "provider_error", `FMP request failed with HTTP ${response.status}.`, {
        httpStatus: response.status,
        endpoint,
        request: sanitizeUrl(url)
      });
    }
    if (payload?.["Error Message"] || payload?.error || payload?.message === "Limit Reach") {
      return failure("provider_error", String(payload["Error Message"] ?? payload.error ?? payload.message), {
        endpoint,
        request: sanitizeUrl(url)
      });
    }

    const result = success(payload, {
      cache: "miss",
      endpoint,
      request: sanitizeUrl(url),
      providerStatus: "ok"
    });
    if (ttlMs > 0) {
      setCachedResponse(cacheKey, result, ttlMs);
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      return failure("timeout", `FMP request timed out after ${timeoutMs}ms.`, {
        endpoint,
        request: sanitizeUrl(url)
      });
    }
    return failure("network_failure", "Unable to reach FMP.", {
      endpoint,
      request: sanitizeUrl(url),
      message: error?.message
    });
  } finally {
    clearTimeout(timeout);
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : String(value);
}

function toIsoDate(value, fallback = new Date()) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback.toISOString();
}

function normalizeImpact(value, eventName = "") {
  const text = `${value ?? ""} ${eventName}`.toLowerCase();
  if (/(high|fomc|cpi|nfp|nonfarm|fed rate|interest rate|unemployment|gdp|ppi)/i.test(text)) {
    return "high";
  }
  if (/(medium|retail sales|pce|consumer confidence|pmi|ism|jobless)/i.test(text)) {
    return "medium";
  }
  if (/low/i.test(text)) {
    return "low";
  }
  return "unknown";
}

function normalizeSymbols(value) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[,\s]+/)
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function symbolToFmp(symbol = "") {
  return String(symbol).replace("/", "").toUpperCase();
}

function appliesToCurrency(symbol, currency) {
  const clean = symbolToFmp(symbol);
  const upperCurrency = String(currency ?? "").toUpperCase();
  if (!upperCurrency) {
    return false;
  }
  if (clean.includes(upperCurrency)) {
    return true;
  }
  if (upperCurrency === "USD" && ["US30", "NASDAQ", "NAS100", "SPX", "XAUUSD", "BTCUSD", "ETHUSD"].some((item) => clean.includes(item))) {
    return true;
  }
  return false;
}

function normalizeEconomicEvent(item, index = 0) {
  const generatedAt = now();
  const eventName = String(item?.event ?? item?.eventName ?? item?.name ?? item?.title ?? "Economic event");
  const scheduledAt = toIsoDate(item?.date ?? item?.datetime ?? item?.time ?? item?.scheduledAt);
  const country = String(item?.country ?? item?.region ?? "");
  const currency = String(item?.currency ?? item?.currencyCode ?? (country === "US" ? "USD" : ""));
  const impact = normalizeImpact(item?.impact ?? item?.importance, eventName);
  const sourceFingerprint = hashPayload({
    provider: "fmp",
    kind: "economic_event",
    eventName,
    scheduledAt,
    country,
    currency,
    index
  });
  return {
    eventId: `economic_event_${sourceFingerprint}`,
    provider: "fmp",
    country,
    currency,
    eventName,
    category: String(item?.category ?? item?.type ?? "economic_calendar"),
    impact,
    scheduledAt,
    actual: toNumberOrNull(item?.actual),
    forecast: toNumberOrNull(item?.estimate ?? item?.forecast),
    previous: toNumberOrNull(item?.previous),
    sourceUrl: undefined,
    sourceFingerprint,
    generatedAt
  };
}

function normalizeNewsItem(item, category, index = 0) {
  const generatedAt = now();
  const headline = String(item?.title ?? item?.headline ?? "Market news");
  const publishedAt = toIsoDate(item?.publishedDate ?? item?.date ?? item?.datetime ?? item?.publishedAt);
  const url = item?.url ? String(item.url) : undefined;
  const source = String(item?.site ?? item?.source ?? item?.publisher ?? "FMP");
  const symbols = normalizeSymbols(item?.symbol ?? item?.symbols ?? item?.tickers);
  const sourceFingerprint = hashPayload({
    provider: "fmp",
    kind: "news",
    category,
    headline,
    publishedAt,
    url,
    index
  });
  return {
    newsId: `market_news_${sourceFingerprint}`,
    provider: "fmp",
    category,
    symbols,
    headline,
    summary: String(item?.text ?? item?.summary ?? item?.snippet ?? ""),
    publishedAt,
    url,
    source,
    sourceFingerprint,
    generatedAt
  };
}

function mockEconomicEvents(referenceDate = new Date()) {
  const high = new Date(referenceDate.getTime() + 30 * 60 * 1000);
  const medium = new Date(referenceDate.getTime() + 2 * 60 * 60 * 1000);
  return [
    normalizeEconomicEvent(
      {
        country: "US",
        currency: "USD",
        event: "FOMC Rate Decision",
        category: "central_bank",
        impact: "high",
        date: high.toISOString(),
        forecast: "5.25%",
        previous: "5.25%"
      },
      0
    ),
    normalizeEconomicEvent(
      {
        country: "US",
        currency: "USD",
        event: "Retail Sales",
        category: "growth",
        impact: "medium",
        date: medium.toISOString(),
        forecast: "0.2%",
        previous: "0.1%"
      },
      1
    )
  ];
}

function mockNewsItems(referenceDate = new Date()) {
  return [
    normalizeNewsItem(
      {
        symbol: "EURUSD",
        title: "Dollar steadies before US policy decision",
        text: "Forex traders monitor USD volatility ahead of a scheduled high-impact event.",
        publishedDate: new Date(referenceDate.getTime() - 15 * 60 * 1000).toISOString(),
        site: "FMP mock"
      },
      "forex",
      0
    ),
    normalizeNewsItem(
      {
        symbol: "SPX",
        title: "US index futures hold range as macro data approaches",
        text: "Index-related news remains cautious before economic releases.",
        publishedDate: new Date(referenceDate.getTime() - 20 * 60 * 1000).toISOString(),
        site: "FMP mock"
      },
      "stock",
      1
    ),
    normalizeNewsItem(
      {
        symbol: "BTCUSD",
        title: "Bitcoin consolidates as risk sentiment stays mixed",
        text: "Crypto market context is mixed and should not create trade direction.",
        publishedDate: new Date(referenceDate.getTime() - 25 * 60 * 1000).toISOString(),
        site: "FMP mock"
      },
      "crypto",
      2
    ),
    normalizeNewsItem(
      {
        title: "Global markets await economic calendar catalysts",
        text: "General market news points to event risk rather than directional conviction.",
        publishedDate: new Date(referenceDate.getTime() - 30 * 60 * 1000).toISOString(),
        site: "FMP mock"
      },
      "general",
      3
    )
  ];
}

function sortEconomicEvents(events) {
  return [...events].sort((left, right) => {
    const impactDelta = impactRank[right.impact] - impactRank[left.impact];
    if (impactDelta !== 0) {
      return impactDelta;
    }
    return Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt);
  });
}

function sortNewsItems(items) {
  return [...items].sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

export async function getEconomicCalendar(options = {}) {
  const dryRun = options.dryRun ?? !getFmpEnvironmentStatus().hasApiKey;
  if (dryRun) {
    return success(sortEconomicEvents(mockEconomicEvents()).slice(0, MAX_ECONOMIC_EVENTS), {
      providerStatus: "dry_run"
    });
  }
  const response = await requestFmp(
    "/stable/economic-calendar",
    {
      from: options.from,
      to: options.to
    },
    {
      cacheTtlMs: options.cacheTtlMs ?? getNumericEnv("FMP_ECONOMIC_CACHE_TTL_MS", DEFAULT_ECONOMIC_CACHE_TTL_MS),
      timeoutMs: options.timeoutMs,
      bypassCache: options.bypassCache
    }
  );
  if (!response.ok) {
    return response;
  }
  const values = Array.isArray(response.data) ? response.data : [];
  return success(sortEconomicEvents(values.map(normalizeEconomicEvent)).slice(0, MAX_ECONOMIC_EVENTS), {
    providerStatus: response.providerStatus,
    cache: response.cache
  });
}

async function getNews(endpoint, category, options = {}) {
  const dryRun = options.dryRun ?? !getFmpEnvironmentStatus().hasApiKey;
  if (dryRun) {
    return success(
      sortNewsItems(mockNewsItems().filter((item) => item.category === category || category === "general")).slice(0, MAX_NEWS_ITEMS),
      {
        providerStatus: "dry_run"
      }
    );
  }
  const response = await requestFmp(
    endpoint,
    {
      page: options.page ?? 0,
      limit: Math.min(options.limit ?? MAX_NEWS_ITEMS, MAX_NEWS_ITEMS),
      symbols: options.symbols
    },
    {
      cacheTtlMs:
        options.cacheTtlMs ??
        getNumericEnv(options.symbols ? "FMP_SYMBOL_NEWS_CACHE_TTL_MS" : "FMP_NEWS_CACHE_TTL_MS", options.symbols ? DEFAULT_SYMBOL_NEWS_CACHE_TTL_MS : DEFAULT_NEWS_CACHE_TTL_MS),
      timeoutMs: options.timeoutMs,
      bypassCache: options.bypassCache
    }
  );
  if (!response.ok) {
    return response;
  }
  const values = Array.isArray(response.data) ? response.data : [];
  return success(sortNewsItems(values.map((item, index) => normalizeNewsItem(item, category, index))).slice(0, MAX_NEWS_ITEMS), {
    providerStatus: response.providerStatus,
    cache: response.cache
  });
}

export const getGeneralNews = (options = {}) => getNews("/stable/news/general-latest", "general", options);

export const getForexNews = (symbol, options = {}) =>
  symbol
    ? getNews("/stable/news/forex", "forex", { ...options, symbols: symbolToFmp(symbol) })
    : getNews("/stable/news/forex-latest", "forex", options);

export const getCryptoNews = (symbol, options = {}) =>
  symbol
    ? getNews("/stable/news/crypto", "crypto", { ...options, symbols: symbolToFmp(symbol) })
    : getNews("/stable/news/crypto-latest", "crypto", options);

export const getIndexNews = (symbol, options = {}) =>
  symbol
    ? getNews("/stable/news/stock", "stock", { ...options, symbols: symbolToFmp(symbol) })
    : getNews("/stable/news/stock-latest", "stock", options);

function riskWindowFor(event) {
  const scheduledAtMs = Date.parse(event.scheduledAt);
  if (!Number.isFinite(scheduledAtMs)) {
    return {
      severity: "monitor",
      windowStart: undefined,
      windowEnd: undefined,
      active: false
    };
  }
  const settings =
    event.impact === "high"
      ? { severity: "block", before: 60, after: 30 }
      : event.impact === "medium"
        ? { severity: "reduce_risk", before: 30, after: 15 }
        : { severity: "monitor", before: 0, after: 0 };
  const windowStart = new Date(scheduledAtMs - settings.before * 60_000);
  const windowEnd = new Date(scheduledAtMs + settings.after * 60_000);
  const current = Date.now();
  return {
    severity: settings.severity,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    active: current >= windowStart.getTime() && current <= windowEnd.getTime()
  };
}

export function buildMacroRiskFlags(events = [], { symbol = "", includeInactive = true } = {}) {
  const flags = [];
  for (const event of events) {
    const related = appliesToCurrency(symbol, event.currency) || event.currency === "USD" || !event.currency;
    if (!related) {
      continue;
    }
    const window = riskWindowFor(event);
    const severity = window.active ? window.severity : "monitor";
    if (!includeInactive && severity === "monitor" && event.impact !== "low" && event.impact !== "unknown") {
      continue;
    }
    const reason =
      severity === "block"
        ? `${event.eventName} is high-impact and inside the blocking window.`
        : severity === "reduce_risk"
          ? `${event.eventName} is medium-impact and inside the risk-reduction window.`
          : `${event.eventName} is macro context only; monitor for volatility.`;
    flags.push({
      flagId: `macro_risk_${hashPayload({ eventId: event.eventId, symbol, severity, windowStart: window.windowStart })}`,
      severity,
      reason,
      eventId: event.eventId,
      appliesToSymbols: symbol ? [symbol] : [],
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      generatedAt: now()
    });
  }
  return flags.sort((left, right) => {
    const severityRank = { block: 3, reduce_risk: 2, monitor: 1 };
    return severityRank[right.severity] - severityRank[left.severity];
  });
}

export function buildNewsSentimentSummary(newsItems = []) {
  const generatedAt = now();
  if (!newsItems.length) {
    return {
      bias: "unknown",
      confidence: 0,
      reason: "No bounded news context available. Market context cannot create trade direction.",
      generatedAt
    };
  }
  const text = newsItems.map((item) => `${item.headline} ${item.summary}`).join(" ").toLowerCase();
  const bullishHits = (text.match(/\b(rally|gain|higher|surge|bull|optimis|risk-on|rebound)\b/g) ?? []).length;
  const bearishHits = (text.match(/\b(fall|drop|lower|selloff|bear|risk-off|slump|concern|fear)\b/g) ?? []).length;
  const bias = bullishHits > bearishHits ? "bullish" : bearishHits > bullishHits ? "bearish" : bullishHits || bearishHits ? "mixed" : "neutral";
  const confidence = Math.min(0.55, Math.max(0.1, Math.abs(bullishHits - bearishHits) / Math.max(1, newsItems.length * 3)));
  return {
    bias,
    confidence,
    reason: "News sentiment is context only. It may warn or reduce confidence, but cannot create long/short trade direction.",
    generatedAt
  };
}

export async function buildMarketContextSnapshot({ dryRun, symbol = "EUR/USD" } = {}) {
  const economic = await getEconomicCalendar({ dryRun });
  const general = await getGeneralNews({ dryRun });
  const forex = await getForexNews(symbol, { dryRun });
  const crypto = await getCryptoNews(symbol, { dryRun });
  const index = await getIndexNews(symbol, { dryRun });
  const economicEvents = economic.ok ? economic.data : [];
  const newsItems = sortNewsItems([
    ...(general.ok ? general.data : []),
    ...(forex.ok ? forex.data : []),
    ...(crypto.ok ? crypto.data : []),
    ...(index.ok ? index.data : [])
  ]).slice(0, MAX_NEWS_ITEMS);
  const macroRiskFlags = buildMacroRiskFlags(economicEvents, { symbol }).slice(0, MAX_ECONOMIC_EVENTS);
  const newsSentiment = buildNewsSentimentSummary(newsItems);
  const generatedAt = now();
  const sentimentSnapshotId = uid("market_context");
  const boundedEvidence = {
    economicEvents: economicEvents.slice(0, MAX_ECONOMIC_EVENTS).map((event) => ({
      eventId: event.eventId,
      currency: event.currency,
      eventName: event.eventName,
      impact: event.impact,
      scheduledAt: event.scheduledAt
    })),
    newsItems: newsItems.slice(0, MAX_NEWS_ITEMS).map((item) => ({
      newsId: item.newsId,
      category: item.category,
      symbols: item.symbols,
      headline: item.headline,
      publishedAt: item.publishedAt,
      source: item.source
    })),
    macroRiskFlags: macroRiskFlags.slice(0, OPENCLAW_MAX_MACRO_FLAGS)
  };
  const sourceFingerprint = hashPayload({
    provider: "fmp",
    symbol,
    economic: economicEvents.map((event) => event.sourceFingerprint),
    news: newsItems.map((item) => item.sourceFingerprint),
    macroRiskFlags: macroRiskFlags.map((flag) => flag.flagId)
  });
  return success(
    {
      sentimentSnapshotId,
      provider: "fmp",
      symbol,
      generatedAt,
      economicEvents: economicEvents.slice(0, MAX_ECONOMIC_EVENTS),
      newsItems,
      macroRiskFlags,
      newsSentiment,
      boundedEvidence,
      sourceFingerprint,
      providerPayloadIncluded: false,
      decisionVersion: MARKET_CONTEXT_CONTRACT_VERSION,
      sentimentPolicyVersion: MARKET_CONTEXT_SENTIMENT_POLICY_VERSION
    },
    {
      providerStatus: [economic, general, forex, crypto, index].every((result) => result.ok) ? "ok" : "partial"
    }
  );
}

export function buildOpenClawMarketContextPacket(snapshot) {
  const blocksExecutionWindow = snapshot.macroRiskFlags.some((flag) => flag.severity === "block");
  const reduceRiskWindow = snapshot.macroRiskFlags.some((flag) => flag.severity === "reduce_risk");
  return {
    packetId: uid("openclaw_market_context_packet"),
    source: "gotrader_market_context_service",
    mode: "advisory_only",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    generatedAt: now(),
    symbol: snapshot.symbol,
    sentimentSnapshotId: snapshot.sentimentSnapshotId,
    topMacroRiskFlags: snapshot.macroRiskFlags.slice(0, OPENCLAW_MAX_MACRO_FLAGS),
    boundedNewsSummaries: snapshot.boundedEvidence.newsItems,
    newsSentiment: snapshot.newsSentiment,
    sourceFingerprint: snapshot.sourceFingerprint,
    riskSummary: {
      blocksExecutionWindow,
      reduceRiskWindow,
      monitorOnly: !blocksExecutionWindow && !reduceRiskWindow,
      reason: blocksExecutionWindow
        ? "High-impact macro event is inside the blocking window."
        : reduceRiskWindow
          ? "Medium-impact macro event is inside the risk-reduction window."
          : "No blocking macro event is active."
    },
    safetyLocks: {
      apiKeysIncluded: false,
      brokerCredentialsIncluded: false,
      rawProviderPayloadIncluded: false,
      executionPermissionGranted: false,
      riskManagerBypassIncluded: false
    }
  };
}

export function clearFmpMarketContextCache() {
  responseCache.clear();
}
