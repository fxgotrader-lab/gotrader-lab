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
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 3500);

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
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

const compactCandlesResponse = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const candles = Array.isArray(payload.candles) ? payload.candles : [];
  const firstTimestamp = payload.firstTimestamp ?? candles[0]?.timestamp;
  const lastTimestamp = payload.lastTimestamp ?? candles.at(-1)?.timestamp;
  const availableLookbackDays =
    firstTimestamp && lastTimestamp
      ? Number(((Date.parse(lastTimestamp) - Date.parse(firstTimestamp)) / (24 * 60 * 60 * 1000)).toFixed(2))
      : 0;
  const returnedCount = Number(payload.returnedCount ?? candles.length ?? 0);
  const depthStatus =
    !returnedCount || availableLookbackDays <= 0
      ? "unavailable"
      : availableLookbackDays >= requestedLookbackDays * 0.8
        ? "sufficient"
        : availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)
          ? "limited"
          : "insufficient";
  return {
    provider: "mt5_read_only",
    requestedSymbol,
    brokerSymbol: payload.brokerSymbol ?? payload.symbol ?? brokerSymbol,
    timeframe: payload.timeframe ?? timeframe,
    requestedLookbackDays,
    requestedLimit: limit,
    returnedCount,
    firstTimestamp,
    lastTimestamp,
    availableLookbackDays,
    depthStatus,
    chunkingStatus: "single_window",
    warnings: [
      ...(payload.warnings ?? []),
      depthStatus === "sufficient"
        ? "MT5 read-only single-window depth is sufficient for 90-day review."
        : "MT5 read-only single-window depth is not enough for 90-day calibration evidence."
    ],
    missingEvidence: [
      ...(payload.missingEvidence ?? []),
      depthStatus === "sufficient" ? undefined : "Wrapper range/chunk endpoint is not required for current reads but is needed for full 90-day calibration."
    ].filter(Boolean),
    authority,
    safety: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false
    }
  };
};

const endpoint = (path) => `${bridgeUrl}/${path}`.replace(/\/$/, "");
const path = `candles?requestedSymbol=${encodeURIComponent(requestedSymbol)}&symbol=${encodeURIComponent(brokerSymbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${Math.min(5000, Math.max(1, limit))}`;

let result;
try {
  const response = await fetchWithTimeout(endpoint(path));
  result = {
    bridgeUrl,
    ok: response.ok,
    status: response.status,
    summary: response.ok ? compactCandlesResponse(response.payload) : undefined,
    note: response.ok
      ? "MT5 depth diagnostic completed with compact metadata only."
      : "MT5 depth diagnostic could not reach /candles. This is allowed when the wrapper is offline."
  };
} catch (error) {
  result = {
    bridgeUrl,
    ok: false,
    status: "offline",
    summary: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe,
      requestedLookbackDays,
      requestedLimit: limit,
      returnedCount: 0,
      availableLookbackDays: 0,
      depthStatus: "unavailable",
      chunkingStatus: "unavailable",
      warnings: ["MT5 read-only wrapper is offline or timed out."],
      missingEvidence: ["Start MT5 upstream and GoTrader MT5 read-only wrapper for depth diagnostics."],
      authority,
      safety: {
        rawCandlesIncluded: false,
        rawSnapshotsIncluded: false,
        secretsIncluded: false,
        accountDataIncluded: false,
        orderDataIncluded: false,
        positionDataIncluded: false
      }
    },
    note: "MT5 depth diagnostic exits successfully while reporting unavailable depth."
  };
}

const serialized = JSON.stringify(result);
const safe =
  !/"candles"\s*:/i.test(serialized) &&
  !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized) &&
  result.summary?.authority?.executionAuthority === "none" &&
  result.summary?.authority?.brokerAuthority === "none" &&
  result.summary?.authority?.readinessOverrideAuthority === "none";

console.log(JSON.stringify({ ...result, safe }, null, 2));
process.exitCode = safe ? 0 : 1;
