const bridgeUrl = (process.env.TRADINGVIEW_MCP_BRIDGE_URL || "http://127.0.0.1:7331").replace(/\/$/, "");
const symbol = process.env.TRADINGVIEW_MCP_TEST_SYMBOL || "MNQ";
const timeframe = process.env.TRADINGVIEW_MCP_TEST_TIMEFRAME || "5m";
const timeoutMs = 2500;

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const fetchWithTimeout = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
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

const checks = [];

for (const endpoint of ["health", "status", ""]) {
  const url = `${bridgeUrl}/${endpoint}`.replace(/\/$/, "");
  try {
    checks.push({ endpoint: endpoint || "/", url, ...(await fetchWithTimeout(url)) });
  } catch (error) {
    checks.push({
      endpoint: endpoint || "/",
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

try {
  checks.push({
    endpoint: "POST /evidence",
    url: `${bridgeUrl}/evidence`,
    ...(await fetchWithTimeout(`${bridgeUrl}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, timeframe })
    }))
  });
} catch (error) {
  checks.push({
    endpoint: "POST /evidence",
    url: `${bridgeUrl}/evidence`,
    ok: false,
    status: "error",
    payload: error instanceof Error ? error.message : String(error)
  });
}

for (const endpoint of [
  `quote?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
  `candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=5`,
  `snapshot?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=5`
]) {
  const url = `${bridgeUrl}/${endpoint}`;
  try {
    checks.push({ endpoint: `GET /${endpoint}`, url, ...(await fetchWithTimeout(url)) });
  } catch (error) {
    checks.push({
      endpoint: `GET /${endpoint}`,
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

const connected = checks.some((check) => check.ok);
const candlesCheck = checks.find((check) => String(check.endpoint).startsWith("GET /candles"));
const candlePayload = candlesCheck?.payload && typeof candlesCheck.payload === "object" ? candlesCheck.payload : undefined;
const quoteCheck = checks.find((check) => String(check.endpoint).startsWith("GET /quote"));
const quotePayload = quoteCheck?.payload && typeof quoteCheck.payload === "object" ? quoteCheck.payload : undefined;

console.log(
  JSON.stringify(
    {
      bridgeUrl,
      symbol,
      timeframe,
      connected,
      quoteEndpoint: quotePayload
        ? {
            connectionStatus: quotePayload.connectionStatus,
            latestPrice: quotePayload.latestPrice,
            authority: {
              executionAuthority: quotePayload.executionAuthority,
              brokerAuthority: quotePayload.brokerAuthority,
              readinessOverrideAuthority: quotePayload.readinessOverrideAuthority
            }
          }
        : undefined,
      candleEndpoint: candlePayload
        ? {
            connectionStatus: candlePayload.connectionStatus,
            candleCount: candlePayload.candleCount,
            firstTimestamp: candlePayload.firstTimestamp,
            lastTimestamp: candlePayload.lastTimestamp,
            missingEvidence: candlePayload.missingEvidence
          }
        : undefined,
      mode: "read_only_chart_data",
      note: connected
        ? "Bridge responded. Evidence and candle feed remain read-only and advisory."
        : "Bridge did not respond. This is expected unless the local wrapper is running.",
      ...authority,
      checks
    },
    null,
    2
  )
);

process.exitCode = 0;
