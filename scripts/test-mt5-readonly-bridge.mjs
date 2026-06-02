const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol =
  process.env.MT5_READONLY_BROKER_SYMBOL ||
  process.env.MT5_READONLY_DEFAULT_SYMBOL ||
  "USTECH";
const timeframe = process.env.MT5_READONLY_TEST_TIMEFRAME || "5m";
const limit = Number(process.env.MT5_READONLY_TEST_LIMIT || 1000);
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 2500);
const researchMinimumCandles = 400;

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

const compact = (payload) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  if (payload.candles && typeof payload.candles === "object" && Array.isArray(payload.candles.candles)) {
    return {
      ...payload,
      candles: {
        ...payload.candles,
        candles: payload.candles.candles.slice(0, 2),
        candleSampleNote: `${payload.candles.candles.length} candles returned; nested snapshot output compacted.`
      }
    };
  }
  if (!Array.isArray(payload.candles)) {
    return payload;
  }
  return {
    ...payload,
    candles: payload.candles.slice(0, 2),
    candleSampleNote: `${payload.candles.length} candles returned; terminal output compacted.`
  };
};

const checks = [];
const runCheck = async (label, path) => {
  const url = `${bridgeUrl}/${path}`.replace(/\/$/, "");
  try {
    const result = await fetchWithTimeout(url);
    checks.push({ endpoint: label, url, ...result, payload: compact(result.payload) });
    return result.payload && typeof result.payload === "object" ? result.payload : undefined;
  } catch (error) {
    checks.push({
      endpoint: label,
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
};

const health = await runCheck("GET /health", "health");
const status = await runCheck("GET /status", "status");
const quote = await runCheck("GET /quote", `quote?requestedSymbol=${encodeURIComponent(requestedSymbol)}&symbol=${encodeURIComponent(brokerSymbol)}`);
const candles = await runCheck(
  "GET /candles",
  `candles?requestedSymbol=${encodeURIComponent(requestedSymbol)}&symbol=${encodeURIComponent(brokerSymbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
);
const snapshot = await runCheck(
  "GET /snapshot",
  `snapshot?requestedSymbol=${encodeURIComponent(requestedSymbol)}&symbol=${encodeURIComponent(brokerSymbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
);
const symbols = await runCheck("GET /symbols", "symbols");

const wrapperResponded = checks.some((check) => check.ok && check.payload && typeof check.payload === "object");
const connected =
  status?.connectionStatus === "connected" ||
  quote?.connectionStatus === "connected" ||
  candles?.connectionStatus === "connected";
const returnedCount = Number(candles?.returnedCount ?? candles?.candleCount ?? 0);
const authority = {
  executionAuthority: candles?.executionAuthority ?? quote?.executionAuthority ?? status?.executionAuthority,
  brokerAuthority: candles?.brokerAuthority ?? quote?.brokerAuthority ?? status?.brokerAuthority,
  readinessOverrideAuthority:
    candles?.readinessOverrideAuthority ?? quote?.readinessOverrideAuthority ?? status?.readinessOverrideAuthority
};

console.log(
  JSON.stringify(
    {
      bridgeUrl,
      requestedSymbol,
      symbol: requestedSymbol,
      brokerSymbol,
      brokerSymbolResolution: {
        order: ["MT5_READONLY_BROKER_SYMBOL", "MT5_READONLY_DEFAULT_SYMBOL", "USTECH"]
      },
      timeframe,
      requestedLimit: limit,
      wrapperResponded,
      connected,
      connectionStatus: status?.connectionStatus ?? health?.connectionStatus ?? "disconnected",
      quote: quote
        ? {
            bid: quote.bid,
            ask: quote.ask,
            mid: quote.mid,
            spread: quote.spread,
            timestamp: quote.timestamp,
            connectionStatus: quote.connectionStatus
          }
        : undefined,
      candles: candles
        ? {
            returnedCount,
            firstTimestamp: candles.firstTimestamp,
            lastTimestamp: candles.lastTimestamp,
            depthStatus: candles.depthStatus,
            researchMinimumCandles,
            researchEligibleByDepth: returnedCount >= researchMinimumCandles,
            warnings: candles.warnings,
            missingEvidence: candles.missingEvidence
          }
        : undefined,
      snapshotStatus: snapshot?.status?.connectionStatus ?? snapshot?.connectionStatus,
      symbolCount: Array.isArray(symbols?.symbols) ? symbols.symbols.length : undefined,
      authority,
      note: wrapperResponded
        ? connected
          ? "MT5 read-only bridge responded with market data. Authority remains none."
          : "MT5 read-only bridge responded but is disconnected/planned. This diagnostic exits successfully."
        : "MT5 read-only bridge did not respond. This is expected until a local read-only bridge is running.",
      checks
    },
    null,
    2
  )
);

process.exitCode = 0;
