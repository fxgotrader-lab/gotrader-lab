import fs from "node:fs";
import path from "node:path";

const TWELVE_DATA_REST_BASE_URL = "https://api.twelvedata.com";
const DEFAULT_INTERVAL = "5min";
const DEFAULT_OUTPUT_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 850;
const MAX_OUTPUT_SIZE = 5000;

let envLoaded = false;
let lastRequestStartedAt = 0;
let rateLimitQueue = Promise.resolve();
const responseCache = new Map();

export const DEFAULT_GOTRADER_MODE = "paper";

export const GOTRADER_TWELVE_DATA_WATCHLIST = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "XAU/USD",
  "BTC/USD",
  "ETH/USD",
  "US30",
  "NASDAQ",
  "SPX"
];

export const SYMBOL_ALIAS_MAP = {
  "EUR/USD": {
    gotraderSymbol: "EUR/USD",
    assetClass: "forex",
    twelveDataCandidates: ["EUR/USD"],
    mt5Candidates: ["EURUSD"]
  },
  "GBP/USD": {
    gotraderSymbol: "GBP/USD",
    assetClass: "forex",
    twelveDataCandidates: ["GBP/USD"],
    mt5Candidates: ["GBPUSD"]
  },
  "USD/JPY": {
    gotraderSymbol: "USD/JPY",
    assetClass: "forex",
    twelveDataCandidates: ["USD/JPY"],
    mt5Candidates: ["USDJPY"]
  },
  "XAU/USD": {
    gotraderSymbol: "XAU/USD",
    assetClass: "metal",
    twelveDataCandidates: ["XAU/USD"],
    mt5Candidates: ["XAUUSD", "GOLD"]
  },
  "BTC/USD": {
    gotraderSymbol: "BTC/USD",
    assetClass: "crypto",
    twelveDataCandidates: ["BTC/USD"],
    mt5Candidates: ["BTCUSD"]
  },
  "ETH/USD": {
    gotraderSymbol: "ETH/USD",
    assetClass: "crypto",
    twelveDataCandidates: ["ETH/USD"],
    mt5Candidates: ["ETHUSD"]
  },
  US30: {
    gotraderSymbol: "US30",
    assetClass: "index_cfd",
    twelveDataCandidates: ["DJI", "DIA", "US30", "DJI/USD"],
    mt5Candidates: ["US30", "DJI30", "WallStreet30"]
  },
  NASDAQ: {
    gotraderSymbol: "NASDAQ",
    assetClass: "index_cfd",
    twelveDataCandidates: ["NDX", "QQQ", "IXIC", "NAS100", "NASDAQ"],
    mt5Candidates: ["NAS100", "USTEC", "NAS100.cash"]
  },
  NAS100: {
    gotraderSymbol: "NASDAQ",
    assetClass: "index_cfd",
    twelveDataCandidates: ["NDX", "QQQ", "IXIC", "NAS100", "NASDAQ"],
    mt5Candidates: ["NAS100", "USTEC", "NAS100.cash"]
  },
  SPX: {
    gotraderSymbol: "SPX",
    assetClass: "index_cfd",
    twelveDataCandidates: ["SPX", "SPY", "US500"],
    mt5Candidates: ["US500", "SPX500", "SP500"]
  }
};

const retryableErrorCodes = new Set(["network_failure", "timeout", "rate_limited", "server_error"]);
const invalidSymbolMatchers = [/invalid\s+symbol/i, /symbol.*not.*found/i, /could not be found/i, /not found/i];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export function loadTwelveDataEnvironment({ cwd = process.cwd() } = {}) {
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
  loadTwelveDataEnvironment();
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallbackValue;
}

export function getTwelveDataEnvironmentStatus() {
  loadTwelveDataEnvironment();
  const mode = process.env.GOTRADER_MODE || DEFAULT_GOTRADER_MODE;
  const hasApiKey = Boolean(process.env.TWELVE_DATA_API_KEY);
  return {
    hasApiKey,
    gotraderMode: mode,
    modeIsPaper: mode === "paper",
    requiredVariables: ["TWELVE_DATA_API_KEY", "GOTRADER_MODE=paper"]
  };
}

function getApiKeyResult() {
  loadTwelveDataEnvironment();
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return failure("missing_api_key", "TWELVE_DATA_API_KEY is required. Set it in .env.local or your shell; never commit it.");
  }
  return success(apiKey);
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
      retryable: retryableErrorCodes.has(code),
      ...details
    }
  };
}

function normalizeSymbolKey(symbol) {
  return String(symbol ?? "").trim().toUpperCase();
}

function clampOutputSize(outputsize) {
  const parsed = Number(outputsize);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_OUTPUT_SIZE;
  }
  return Math.max(1, Math.min(MAX_OUTPUT_SIZE, Math.trunc(parsed)));
}

function buildTwelveDataUrl(endpoint, params, apiKey) {
  const url = new URL(endpoint, TWELVE_DATA_REST_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("apikey", apiKey);
  return url;
}

function sanitizeUrl(url) {
  const safeUrl = new URL(url.toString());
  if (safeUrl.searchParams.has("apikey")) {
    safeUrl.searchParams.set("apikey", "[redacted]");
  }
  return safeUrl.toString();
}

function mapProviderErrorCode(payload, httpStatus) {
  const providerCode = Number(payload?.code ?? httpStatus);
  const message = String(payload?.message ?? "");

  if (httpStatus === 429 || providerCode === 429) {
    return "rate_limited";
  }
  if (httpStatus >= 500 || providerCode >= 500) {
    return "server_error";
  }
  if (providerCode === 401 || providerCode === 403) {
    return "auth_error";
  }
  if (invalidSymbolMatchers.some((matcher) => matcher.test(message))) {
    return "invalid_symbol";
  }
  if (providerCode === 404) {
    return "not_found";
  }
  return "provider_error";
}

function isInvalidSymbolFailure(result) {
  return ["invalid_symbol", "not_found", "provider_error"].includes(result?.error?.code);
}

async function throttleTwelveDataRequests() {
  const minIntervalMs = getNumericEnv("TWELVE_DATA_MIN_REQUEST_INTERVAL_MS", DEFAULT_MIN_REQUEST_INTERVAL_MS);
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

async function requestTwelveData(endpoint, params, options = {}) {
  const apiKeyResult = getApiKeyResult();
  if (!apiKeyResult.ok) {
    return apiKeyResult;
  }

  const ttlMs = options.cacheTtlMs ?? getNumericEnv("TWELVE_DATA_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS);
  const cacheKey = JSON.stringify({ endpoint, params });
  if (ttlMs > 0 && !options.bypassCache) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return {
        ...cached,
        cache: "hit"
      };
    }
  }

  const url = buildTwelveDataUrl(endpoint, params, apiKeyResult.data);
  const timeoutMs = options.timeoutMs ?? getNumericEnv("TWELVE_DATA_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await throttleTwelveDataRequests();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      return failure("malformed_response", "Twelve Data returned non-JSON content.", {
        httpStatus: response.status,
        endpoint,
        request: sanitizeUrl(url)
      });
    }

    if (!response.ok || payload?.status === "error") {
      const code = mapProviderErrorCode(payload, response.status);
      return failure(code, payload?.message || `Twelve Data request failed with HTTP ${response.status}.`, {
        httpStatus: response.status,
        providerCode: payload?.code,
        endpoint,
        request: sanitizeUrl(url)
      });
    }

    const result = success(payload, {
      httpStatus: response.status,
      providerStatus: payload?.status ?? "ok",
      cache: "miss",
      endpoint,
      request: sanitizeUrl(url)
    });
    if (ttlMs > 0) {
      setCachedResponse(cacheKey, result, ttlMs);
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      return failure("timeout", `Twelve Data request timed out after ${timeoutMs}ms.`, {
        endpoint,
        request: sanitizeUrl(url)
      });
    }
    return failure("network_failure", "Unable to reach Twelve Data.", {
      endpoint,
      request: sanitizeUrl(url),
      message: error?.message
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function validate_symbol(symbol) {
  const normalized = normalizeSymbolKey(symbol);
  if (!normalized) {
    return failure("invalid_symbol_input", "Symbol is required.");
  }

  const mapping = SYMBOL_ALIAS_MAP[normalized] ?? {
    gotraderSymbol: normalized,
    assetClass: "unknown",
    twelveDataCandidates: [normalized],
    mt5Candidates: [normalized.replace("/", "")]
  };

  return success({
    inputSymbol: symbol,
    gotraderSymbol: mapping.gotraderSymbol,
    assetClass: mapping.assetClass,
    primaryTwelveDataSymbol: mapping.twelveDataCandidates[0],
    twelveDataCandidates: [...mapping.twelveDataCandidates],
    futureMt5Candidates: [...mapping.mt5Candidates],
    note:
      SYMBOL_ALIAS_MAP[normalized] === undefined
        ? "No explicit alias exists yet; using the provided symbol directly."
        : "Alias resolved. Live Twelve Data availability is verified when requests are made."
  });
}

async function trySymbolCandidates(symbol, operation) {
  const validation = validate_symbol(symbol);
  if (!validation.ok) {
    return validation;
  }

  const attemptedSymbols = [];
  let lastFailure = null;
  for (const candidate of validation.data.twelveDataCandidates) {
    attemptedSymbols.push(candidate);
    const result = await operation(candidate, validation.data);
    if (result.ok) {
      return success(result.data, {
        ...result,
        data: result.data,
        symbolMapping: {
          ...validation.data,
          resolvedTwelveDataSymbol: candidate,
          attemptedTwelveDataSymbols: attemptedSymbols
        }
      });
    }

    lastFailure = result;
    if (!isInvalidSymbolFailure(result)) {
      return {
        ...result,
        symbolMapping: {
          ...validation.data,
          attemptedTwelveDataSymbols: attemptedSymbols
        }
      };
    }
  }

  return failure("invalid_symbol", `No Twelve Data candidate worked for ${validation.data.gotraderSymbol}.`, {
    attemptedTwelveDataSymbols: attemptedSymbols,
    lastError: lastFailure?.error
  });
}

function parseNumeric(value, fallback = Number.NaN) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalize_candles(response) {
  const rawValues = Array.isArray(response) ? response : response?.values;
  if (!Array.isArray(rawValues)) {
    return [];
  }

  return rawValues
    .map((value) => ({
      datetime: String(value?.datetime ?? ""),
      open: parseNumeric(value?.open),
      high: parseNumeric(value?.high),
      low: parseNumeric(value?.low),
      close: parseNumeric(value?.close),
      volume: parseNumeric(value?.volume, 0)
    }))
    .filter((candle) => {
      if (!candle.datetime) {
        return false;
      }
      if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
        return false;
      }
      const highIsValid = candle.high >= Math.max(candle.open, candle.close, candle.low);
      const lowIsValid = candle.low <= Math.min(candle.open, candle.close, candle.high);
      return highIsValid && lowIsValid;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.datetime);
      const rightTime = Date.parse(right.datetime);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime;
      }
      return String(left.datetime).localeCompare(String(right.datetime));
    });
}

export async function get_candles(symbol, interval = DEFAULT_INTERVAL, outputsize = DEFAULT_OUTPUT_SIZE, options = {}) {
  const sanitizedOutputSize = clampOutputSize(outputsize);
  return trySymbolCandidates(symbol, async (candidate, mapping) => {
    const response = await requestTwelveData(
      "/time_series",
      {
        symbol: candidate,
        interval,
        outputsize: sanitizedOutputSize,
        format: "JSON"
      },
      options
    );
    if (!response.ok) {
      return response;
    }

    const candles = normalize_candles(response.data);
    if (candles.length === 0) {
      return failure("empty_response", "Twelve Data returned no valid candles.", {
        symbol: mapping.gotraderSymbol,
        twelveDataSymbol: candidate,
        interval,
        outputsize: sanitizedOutputSize,
        providerStatus: response.providerStatus
      });
    }

    return success(candles, {
      meta: response.data?.meta,
      providerStatus: response.providerStatus,
      cache: response.cache,
      request: response.request
    });
  });
}

export async function get_quote(symbol, options = {}) {
  return trySymbolCandidates(symbol, async (candidate, mapping) => {
    const response = await requestTwelveData(
      "/quote",
      {
        symbol: candidate,
        format: "JSON"
      },
      {
        cacheTtlMs: options.cacheTtlMs ?? 15_000,
        timeoutMs: options.timeoutMs,
        bypassCache: options.bypassCache
      }
    );
    if (!response.ok) {
      return response;
    }

    const quote = response.data;
    const latestPrice = parseNumeric(quote?.price ?? quote?.close);
    if (!Number.isFinite(latestPrice)) {
      return failure("malformed_response", "Twelve Data quote did not include a numeric price or close.", {
        symbol: mapping.gotraderSymbol,
        twelveDataSymbol: candidate
      });
    }

    return success(
      {
        symbol: mapping.gotraderSymbol,
        twelveDataSymbol: candidate,
        assetClass: mapping.assetClass,
        name: quote?.name,
        exchange: quote?.exchange,
        datetime: quote?.datetime,
        timestamp: quote?.timestamp,
        price: latestPrice,
        open: parseNumeric(quote?.open, null),
        high: parseNumeric(quote?.high, null),
        low: parseNumeric(quote?.low, null),
        close: parseNumeric(quote?.close, latestPrice),
        volume: parseNumeric(quote?.volume, 0)
      },
      {
        providerStatus: response.providerStatus,
        cache: response.cache,
        request: response.request
      }
    );
  });
}

function inferTrend(candles) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return "neutral";
  }

  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  if (!previous.close) {
    return "neutral";
  }

  const change = (latest.close - previous.close) / previous.close;
  if (change > 0.001) {
    return "bullish";
  }
  if (change < -0.001) {
    return "bearish";
  }
  return "neutral";
}

export async function scan_symbol(symbol, interval = DEFAULT_INTERVAL, options = {}) {
  const candleResult = await get_candles(symbol, interval, options.outputsize ?? DEFAULT_OUTPUT_SIZE, options);
  const validation = validate_symbol(symbol);
  const gotraderSymbol = validation.ok ? validation.data.gotraderSymbol : String(symbol ?? "");

  if (!candleResult.ok) {
    return {
      symbol: gotraderSymbol,
      timeframe: interval,
      latest_close: 0,
      trend: "neutral",
      setup: "no_trade",
      entry: null,
      stop_loss: null,
      take_profit: null,
      confidence: 0,
      reason: `Market data unavailable: ${candleResult.error.message}`,
      api_status: "error",
      error: candleResult.error
    };
  }

  const latestCandle = candleResult.data[candleResult.data.length - 1];
  return {
    symbol: candleResult.symbolMapping?.gotraderSymbol ?? gotraderSymbol,
    timeframe: interval,
    latest_close: latestCandle?.close ?? 0,
    trend: inferTrend(candleResult.data),
    setup: "no_trade",
    entry: null,
    stop_loss: null,
    take_profit: null,
    confidence: 0,
    reason: "Market data loaded successfully. Strategy rules not yet enabled.",
    api_status: "ok",
    candle_count: candleResult.data.length,
    latest_candle: latestCandle,
    data_provider: "twelve_data",
    twelveDataSymbol: candleResult.symbolMapping?.resolvedTwelveDataSymbol,
    futureMt5Candidates: candleResult.symbolMapping?.futureMt5Candidates ?? []
  };
}

export async function get_market_snapshot(symbols = GOTRADER_TWELVE_DATA_WATCHLIST, interval = DEFAULT_INTERVAL, options = {}) {
  const results = [];
  for (const symbol of symbols) {
    results.push(await scan_symbol(symbol, interval, options));
  }

  const failed = results.filter((result) => result.api_status !== "ok");
  return success(
    {
      provider: "twelve_data",
      mode: process.env.GOTRADER_MODE || DEFAULT_GOTRADER_MODE,
      interval,
      generatedAt: new Date().toISOString(),
      symbolsRequested: symbols,
      results,
      failures: failed
    },
    {
      providerStatus: failed.length === 0 ? "ok" : "partial"
    }
  );
}

export function clearTwelveDataCache() {
  responseCache.clear();
}

export const getCandles = get_candles;
export const getQuote = get_quote;
export const getMarketSnapshot = get_market_snapshot;
export const validateSymbol = validate_symbol;
export const normalizeCandles = normalize_candles;
export const scanSymbol = scan_symbol;
