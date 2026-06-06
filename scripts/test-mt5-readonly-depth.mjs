#!/usr/bin/env node

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol =
  process.env.MT5_READONLY_BROKER_SYMBOL ||
  process.env.MT5_READONLY_DEFAULT_SYMBOL ||
  "USTECH";
const timeframe = process.env.MT5_READONLY_TEST_TIMEFRAME || "5m";
const limit = Number(process.env.MT5_READONLY_DEPTH_LIMIT || process.env.MT5_READONLY_TEST_LIMIT || 5000);
const requestedLookbackDays = Number(process.env.MT5_READONLY_DEPTH_DAYS || 90);
const chunkDays = Number(process.env.MT5_READONLY_DEPTH_CHUNK_DAYS || 10);
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 7000);

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesIncluded: false,
  rawSnapshotsIncluded: false,
  secretsIncluded: false,
  accountDataIncluded: false,
  orderDataIncluded: false,
  positionDataIncluded: false
};

const round = (value, decimals = 2) => Number(value.toFixed(decimals));
const safeLimit = Math.max(1, Math.min(5000, limit));

const endpoint = (path, params = {}) => {
  const url = new URL(`${bridgeUrl}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
};

const parseCandleTime = (candle) => {
  const parsed = Date.parse(candle?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle?.time) ? candle.time * 1000 : 0;
};

const normalizeAndDeduplicateCandles = (candles = []) => {
  const seen = new Set();
  return candles
    .filter((candle) =>
      candle &&
      typeof candle === "object" &&
      Boolean(candle.timestamp) &&
      Number.isFinite(Number(candle.open)) &&
      Number.isFinite(Number(candle.high)) &&
      Number.isFinite(Number(candle.low)) &&
      Number.isFinite(Number(candle.close))
    )
    .sort((left, right) => parseCandleTime(left) - parseCandleTime(right))
    .filter((candle) => {
      const key = parseCandleTime(candle);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const availableLookbackDaysFor = ({ firstTimestamp, lastTimestamp }) => {
  if (!firstTimestamp || !lastTimestamp) return 0;
  const span = Date.parse(lastTimestamp) - Date.parse(firstTimestamp);
  return Number.isFinite(span) ? round(Math.max(0, span) / (24 * 60 * 60 * 1000)) : 0;
};

const classifyDepth = ({ availableLookbackDays, candleCount }) => {
  if (!candleCount || availableLookbackDays <= 0) return "unavailable";
  if (availableLookbackDays >= requestedLookbackDays * 0.8) return "sufficient";
  if (availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)) return "limited";
  return "insufficient";
};

const compactSummary = ({
  candles,
  chunkCount = 0,
  chunkingStatus,
  limitationReason,
  payload,
  sourceMethod
}) => {
  const normalized = normalizeAndDeduplicateCandles(candles);
  const firstTimestamp = payload?.firstTimestamp ?? normalized[0]?.timestamp;
  const lastTimestamp = payload?.lastTimestamp ?? normalized.at(-1)?.timestamp;
  const candleCount = Number(payload?.returnedCount ?? normalized.length ?? 0);
  const availableLookbackDays = availableLookbackDaysFor({ firstTimestamp, lastTimestamp });
  const dataDepthStatus = classifyDepth({ availableLookbackDays, candleCount });
  const resolvedLimitation =
    limitationReason ??
    (dataDepthStatus === "sufficient"
      ? undefined
      : chunkingStatus === "not_supported_by_wrapper"
        ? "The running MT5 read-only wrapper does not expose /candles/range; restart the updated wrapper or configure MT5_READONLY_UPSTREAM_CANDLES_RANGE_PATH."
        : chunkingStatus === "single_window"
          ? "The latest-count /candles endpoint is capped to one 5000-candle GoTrader wrapper window."
          : "The explicit chunked MT5 history response did not cover the requested 90-day lookback.");
  return {
    provider: "mt5_read_only",
    requestedSymbol,
    brokerSymbol: payload?.brokerSymbol ?? payload?.symbol ?? brokerSymbol,
    timeframe: payload?.timeframe ?? timeframe,
    requestedLookbackDays,
    availableLookbackDays,
    candleCount,
    returnedCount: candleCount,
    chunkCount,
    firstCandleTime: firstTimestamp,
    lastCandleTime: lastTimestamp,
    firstTimestamp,
    lastTimestamp,
    dataDepthStatus,
    depthStatus: dataDepthStatus,
    chunkingStatus,
    sourceMethod,
    limitationReason: resolvedLimitation,
    warnings: [
      ...(payload?.warnings ?? []),
      dataDepthStatus === "sufficient"
        ? "MT5 read-only depth is sufficient for 90-day analysis."
        : "MT5 read-only depth is limited or unavailable for 90-day analysis."
    ],
    missingEvidence: [
      ...(payload?.missingEvidence ?? []),
      dataDepthStatus === "sufficient"
        ? undefined
        : `Need closer to ${requestedLookbackDays} days before treating MT5 session calibration as deep-history evidence.`
    ].filter(Boolean),
    authority,
    safety
  };
};

const fetchLatestWindow = async () => {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit: safeLimit
  }));
  const candles = response.ok && typeof response.payload === "object" ? response.payload.candles ?? [] : [];
  return {
    ok: response.ok,
    status: response.status,
    summary: response.ok
      ? compactSummary({
          candles,
          chunkingStatus: "single_window",
          payload: response.payload,
          sourceMethod: response.payload?.sourceMethod ?? "GET /candles"
        })
      : undefined,
    rawCandleCount: Array.isArray(candles) ? candles.length : 0,
    lastTimestamp: response.payload?.lastTimestamp ?? candles.at?.(-1)?.timestamp
  };
};

const dateWindows = (endTime) => {
  const end = Number.isFinite(endTime) ? new Date(endTime) : new Date();
  const start = new Date(end.getTime() - requestedLookbackDays * 24 * 60 * 60 * 1000);
  const chunkMillis = Math.max(1, chunkDays) * 24 * 60 * 60 * 1000;
  const windows = [];
  let cursor = start.getTime();
  while (cursor < end.getTime() && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end.getTime());
    windows.push({
      from: new Date(cursor).toISOString(),
      to: new Date(next).toISOString()
    });
    cursor = next;
  }
  return windows;
};

const fetchMt5CandlesByDateRange = async ({ from, to }) =>
  fetchWithTimeout(endpoint("candles/range", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    from,
    to,
    limit: safeLimit
  }));

const fetchMt5CandlesInChunks = async ({ endTime }) => {
  const windows = dateWindows(endTime);
  const chunkReports = [];
  const candles = [];
  let unsupportedReason;

  for (const window of windows) {
    const response = await fetchMt5CandlesByDateRange(window);
    if (response.status === 404) {
      unsupportedReason = "The running MT5 read-only wrapper returned 404 for /candles/range; restart the updated wrapper before chunked history can run.";
      break;
    }
    if (!response.ok) {
      unsupportedReason = `The MT5 read-only wrapper returned HTTP ${response.status} for /candles/range.`;
      break;
    }
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    chunkReports.push({
      from: window.from,
      to: window.to,
      returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? chunkCandles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? chunkCandles.at(-1)?.timestamp,
      connectionStatus: payload.connectionStatus,
      depthStatus: payload.depthStatus,
      sourceMethod: payload.sourceMethod,
      warnings: payload.warnings ?? [],
      missingEvidence: payload.missingEvidence ?? []
    });
    candles.push(...chunkCandles);
    if (!chunkCandles.length && payload.connectionStatus !== "connected") {
      unsupportedReason = payload.missingEvidence?.[0] || "The MT5 date-range route responded but did not return usable OHLCV candles.";
      break;
    }
  }

  const normalized = normalizeAndDeduplicateCandles(candles);
  const summary = compactSummary({
    candles: normalized,
    chunkCount: chunkReports.length,
    chunkingStatus: normalized.length ? "chunked_cached" : "not_supported_by_wrapper",
    limitationReason: normalized.length ? undefined : unsupportedReason,
    payload: {
      symbol: brokerSymbol,
      brokerSymbol,
      requestedSymbol,
      timeframe,
      returnedCount: normalized.length,
      firstTimestamp: normalized[0]?.timestamp,
      lastTimestamp: normalized.at(-1)?.timestamp,
      warnings: [],
      missingEvidence: normalized.length ? [] : [unsupportedReason].filter(Boolean)
    },
    sourceMethod: normalized.length ? "GET /candles/range chunked" : "GET /candles/range"
  });

  return {
    attempted: true,
    requestedChunkDays: chunkDays,
    requestedLimitPerChunk: safeLimit,
    requestedChunkCount: windows.length,
    completedChunkCount: chunkReports.length,
    summary,
    chunks: chunkReports.map((chunk) => ({
      from: chunk.from,
      to: chunk.to,
      returnedCount: chunk.returnedCount,
      firstTimestamp: chunk.firstTimestamp,
      lastTimestamp: chunk.lastTimestamp,
      connectionStatus: chunk.connectionStatus,
      depthStatus: chunk.depthStatus,
      sourceMethod: chunk.sourceMethod,
      missingEvidence: chunk.missingEvidence
    }))
  };
};

let result;
try {
  const latestWindow = await fetchLatestWindow();
  const latestEndTime = Date.parse(latestWindow.lastTimestamp);
  const chunkedHistory = await fetchMt5CandlesInChunks({ endTime: latestEndTime });
  const bestSummary =
    (chunkedHistory.summary.availableLookbackDays || 0) >= (latestWindow.summary?.availableLookbackDays || 0)
      ? chunkedHistory.summary
      : latestWindow.summary;
  result = {
    bridgeUrl,
    ok: Boolean(latestWindow.ok || chunkedHistory.summary.candleCount),
    status: latestWindow.status,
    rootCause: {
      latestEndpointCap: "GoTrader latest-candle client, wrapper, and depth diagnostic cap /candles requests at 5000 candles.",
      wrapperRangeRoute: chunkedHistory.summary.chunkingStatus === "chunked_cached" ? "available" : "unavailable_or_not_supported_by_running_wrapper",
      brokerOrUpstreamHistoryLimit:
        chunkedHistory.summary.chunkingStatus === "chunked_cached"
          ? "Date-range route returned candles; compare availableLookbackDays to requestedLookbackDays for broker/upstream depth."
          : "Not proven yet because the running wrapper/upstream did not return usable date-range chunks."
    },
    singleWindow: latestWindow.summary,
    chunkedHistory,
    effectiveSummary: bestSummary,
    note:
      bestSummary?.dataDepthStatus === "sufficient"
        ? "MT5 depth diagnostic found enough compact metadata for 90-day analysis. Raw candles were used internally only."
        : "MT5 depth diagnostic completed with compact metadata and an explicit limitation reason."
  };
} catch (error) {
  result = {
    bridgeUrl,
    ok: false,
    status: "offline",
    rootCause: {
      latestEndpointCap: "GoTrader caps latest /candles requests at 5000 candles.",
      wrapperRangeRoute: "unavailable",
      brokerOrUpstreamHistoryLimit: "Not tested because the MT5 read-only wrapper was offline or timed out."
    },
    effectiveSummary: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe,
      requestedLookbackDays,
      availableLookbackDays: 0,
      candleCount: 0,
      returnedCount: 0,
      chunkCount: 0,
      dataDepthStatus: "unavailable",
      depthStatus: "unavailable",
      chunkingStatus: "unavailable",
      limitationReason: error instanceof Error ? error.message : String(error),
      warnings: ["MT5 read-only wrapper is offline or timed out."],
      missingEvidence: ["Start MT5 upstream and GoTrader MT5 read-only wrapper for depth diagnostics."],
      authority,
      safety
    },
    note: "MT5 depth diagnostic exits successfully while reporting unavailable depth."
  };
}

const serialized = JSON.stringify(result);
const safe =
  !/"candles"\s*:/i.test(serialized) &&
  !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized) &&
  result.effectiveSummary?.authority?.executionAuthority === "none" &&
  result.effectiveSummary?.authority?.brokerAuthority === "none" &&
  result.effectiveSummary?.authority?.readinessOverrideAuthority === "none";

console.log(JSON.stringify({ ...result, safe }, null, 2));
process.exitCode = safe ? 0 : 1;
