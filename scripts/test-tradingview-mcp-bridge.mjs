import { diagnoseBridgePort, isGoTraderWrapperPayload } from "./tradingview-bridge-port-utils.mjs";

const bridgeUrl = (process.env.TRADINGVIEW_MCP_BRIDGE_URL || "http://127.0.0.1:7331").replace(/\/$/, "");
const symbol = process.env.TRADINGVIEW_MCP_TEST_SYMBOL || "MNQ";
const timeframe = process.env.TRADINGVIEW_MCP_TEST_TIMEFRAME || "5m";
const depthLimit = Number(process.env.TRADINGVIEW_MCP_TEST_DEPTH_LIMIT || 1000);
const researchMinimumCandles = 400;
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

const compactPayloadForLog = (payload) => {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.candles)) {
    return payload;
  }
  const candles = payload.candles;
  return {
    ...payload,
    candles: candles.slice(0, 2),
    candleSampleNote: `${candles.length} candles returned; output compacted for the terminal test.`
  };
};

const checks = [];

const pushCheck = (check) => {
  checks.push({
    ...check,
    payload: compactPayloadForLog(check.payload)
  });
};

for (const endpoint of ["health", "status", ""]) {
  const url = `${bridgeUrl}/${endpoint}`.replace(/\/$/, "");
  try {
    pushCheck({ endpoint: endpoint || "/", url, ...(await fetchWithTimeout(url)) });
  } catch (error) {
    pushCheck({
      endpoint: endpoint || "/",
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

try {
  pushCheck({
    endpoint: "POST /evidence",
    url: `${bridgeUrl}/evidence`,
    ...(await fetchWithTimeout(`${bridgeUrl}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, timeframe })
    }))
  });
} catch (error) {
  pushCheck({
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
    pushCheck({ endpoint: `GET /${endpoint}`, url, ...(await fetchWithTimeout(url)) });
  } catch (error) {
    pushCheck({
      endpoint: `GET /${endpoint}`,
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

let depthPayload;
const depthEndpoint = `candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${depthLimit}`;
try {
  const result = await fetchWithTimeout(`${bridgeUrl}/${depthEndpoint}`);
  depthPayload = result.payload && typeof result.payload === "object" ? result.payload : undefined;
  pushCheck({ endpoint: `GET /${depthEndpoint}`, url: `${bridgeUrl}/${depthEndpoint}`, ...result });
} catch (error) {
  pushCheck({
    endpoint: `GET /${depthEndpoint}`,
    url: `${bridgeUrl}/${depthEndpoint}`,
    ok: false,
    status: "error",
    payload: error instanceof Error ? error.message : String(error)
  });
}

const wrapperConnected = checks.some((check) => check.ok && isGoTraderWrapperPayload(check.payload));
const connected = wrapperConnected;
const candlesCheck = checks.find((check) => String(check.endpoint).startsWith("GET /candles"));
const candlePayload = candlesCheck?.payload && typeof candlesCheck.payload === "object" ? candlesCheck.payload : undefined;
const quoteCheck = checks.find((check) => String(check.endpoint).startsWith("GET /quote"));
const quotePayload = quoteCheck?.payload && typeof quoteCheck.payload === "object" ? quoteCheck.payload : undefined;
const depthReturnedCount = Number(depthPayload?.returnedCount ?? depthPayload?.candleCount ?? 0);
let portDiagnosis;
if (!wrapperConnected) {
  try {
    const parsedUrl = new URL(bridgeUrl);
    portDiagnosis = await diagnoseBridgePort({
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 80),
      includeCandles: false
    });
  } catch {
    portDiagnosis = undefined;
  }
}

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
      depthCheck: depthPayload
        ? {
            requestedLimit: depthPayload.requestedLimit ?? depthLimit,
            effectiveLimit: depthPayload.effectiveLimit,
            returnedCount: depthReturnedCount,
            researchMinimumCandles: depthPayload.researchMinimumCandles ?? researchMinimumCandles,
            researchMinimumPassed: depthReturnedCount >= researchMinimumCandles,
            upstreamMaxBars: depthPayload.upstreamMaxBars,
            upstreamTotalAvailable: depthPayload.upstreamTotalAvailable,
            depthStatus: depthPayload.depthStatus ?? "unknown",
            depthWarning: depthPayload.depthWarning,
            nextRecommendedAction: depthPayload.nextRecommendedAction
          }
        : undefined,
      mode: "read_only_chart_data",
      note: connected
        ? "Bridge responded. Evidence and candle feed remain read-only and advisory."
        : portDiagnosis?.listeners?.length
          ? "Port is occupied but wrapper did not respond. Run npm.cmd run tradingview:mcp-diagnose-port."
          : "Bridge did not respond. This is expected unless the local wrapper is running.",
      portDiagnosis: portDiagnosis
        ? {
            status: portDiagnosis.status,
            listeners: portDiagnosis.listeners.map((listener) => ({
              localAddress: listener.localAddress,
              pid: listener.pid,
              processName: listener.process?.name,
              executablePath: listener.process?.executablePath
            })),
            nextRecommendedAction: portDiagnosis.nextRecommendedAction
          }
        : undefined,
      ...authority,
      checks
    },
    null,
    2
  )
);

process.exitCode = 0;
