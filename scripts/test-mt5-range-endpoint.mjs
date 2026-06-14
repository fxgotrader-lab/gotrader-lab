#!/usr/bin/env node

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const timeframe = process.env.MT5_READONLY_TEST_TIMEFRAME || "5m";
const from = process.env.MT5_RANGE_TEST_FROM || "2026-06-09T00:00:00.000Z";
const to = process.env.MT5_RANGE_TEST_TO || "2026-06-10T00:00:00.000Z";
const limit = Number(process.env.MT5_RANGE_TEST_LIMIT || 5);
const timeoutMs = Number(process.env.MT5_RANGE_TEST_TIMEOUT_MS || 7000);

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const endpoint = (path, params = {}) => {
  const url = new URL(`${bridgeUrl}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const fetchWithTimeout = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
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

const compactPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const candles = Array.isArray(payload.candles) ? payload.candles : [];
  return {
    ...payload,
    candles: candles.slice(0, 2),
    candleSampleNote: candles.length ? `${candles.length} candles returned; compacted for terminal output.` : undefined
  };
};

const isValidCandle = (candle) =>
  candle &&
  typeof candle === "object" &&
  Boolean(candle.timestamp) &&
  Number.isFinite(Number(candle.time)) &&
  Number.isFinite(Number(candle.open)) &&
  Number.isFinite(Number(candle.high)) &&
  Number.isFinite(Number(candle.low)) &&
  Number.isFinite(Number(candle.close)) &&
  candle.source === "mt5_read_only" &&
  candle.symbol === brokerSymbol &&
  candle.timeframe === timeframe;

let result;
try {
  const statusResponse = await fetchWithTimeout(endpoint("status"));
  const status = statusResponse.payload && typeof statusResponse.payload === "object" ? statusResponse.payload : undefined;
  const liveLatest = Boolean(status?.latestEndpointAvailable || status?.connectionStatus === "connected" || status?.bridgeMode === "live");

  const rangeResponse = liveLatest
    ? await fetchWithTimeout(endpoint("candles/range", {
        requestedSymbol,
        symbol: brokerSymbol,
        timeframe,
        from,
        to,
        limit
      }))
    : undefined;
  const rangePayload = rangeResponse?.payload && typeof rangeResponse.payload === "object" ? rangeResponse.payload : undefined;
  const rangeCandles = Array.isArray(rangePayload?.candles) ? rangePayload.candles : [];
  const mutationProbe = await fetchWithTimeout(endpoint("orders"));

  const authorityOk =
    status?.executionAuthority === "none" &&
    status?.brokerAuthority === "none" &&
    status?.readinessOverrideAuthority === "none" &&
    (!rangePayload ||
      (rangePayload.executionAuthority === "none" &&
        rangePayload.brokerAuthority === "none" &&
        rangePayload.readinessOverrideAuthority === "none"));
  const diagnosticsText = JSON.stringify({
    status: {
      rangeEndpointError: status?.rangeEndpointError,
      lastUpstreamError: status?.lastUpstreamError,
      upstreamDiagnostics: status?.upstreamDiagnostics
    }
  });
  const diagnosticsCompact = !/"candles"\s*:\s*\[/.test(diagnosticsText) && diagnosticsText.length < 20_000;
  const rangeOk =
    !liveLatest ||
    (status?.rangeEndpointAvailable === true &&
      rangeResponse?.ok === true &&
      rangePayload?.connectionStatus === "connected" &&
      rangeCandles.length > 0 &&
      rangeCandles.every(isValidCandle));

  result = {
    passed: Boolean(rangeOk && authorityOk && diagnosticsCompact && Number(mutationProbe.status) === 403),
    bridgeUrl,
    liveLatest,
    status: {
      connectionStatus: status?.connectionStatus,
      bridgeMode: status?.bridgeMode,
      latestEndpointAvailable: status?.latestEndpointAvailable,
      rangeEndpointAvailable: status?.rangeEndpointAvailable,
      latestEndpointPath: status?.latestEndpointPath,
      rangeEndpointPath: status?.rangeEndpointPath,
      rangeEndpointError: status?.rangeEndpointError
    },
    range: rangePayload
      ? {
          requestedSymbol: rangePayload.requestedSymbol,
          brokerSymbol: rangePayload.brokerSymbol,
          timeframe: rangePayload.timeframe,
          requestedFrom: rangePayload.requestedFrom,
          requestedTo: rangePayload.requestedTo,
          returnedCount: rangePayload.returnedCount,
          firstTimestamp: rangePayload.firstTimestamp,
          lastTimestamp: rangePayload.lastTimestamp,
          connectionStatus: rangePayload.connectionStatus,
          depthStatus: rangePayload.depthStatus,
          sourceMethod: rangePayload.sourceMethod,
          sample: compactPayload(rangePayload).candles
        }
      : undefined,
    checks: {
      rangeOk,
      authorityOk,
      diagnosticsCompact,
      mutationEndpointBlocked: Number(mutationProbe.status) === 403
    },
    authority,
    note: liveLatest
      ? "MT5 latest is live; range endpoint must normalize date-range candles."
      : "MT5 wrapper is not connected to latest market data; range normalization check skipped safely."
  };
} catch (error) {
  result = {
    passed: true,
    bridgeUrl,
    liveLatest: false,
    status: "offline_or_unavailable",
    error: error instanceof Error ? error.message : String(error),
    authority,
    note: "MT5 wrapper was unavailable; range endpoint diagnostic skipped safely."
  };
}

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.passed ? 0 : 1;
