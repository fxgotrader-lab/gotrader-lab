import net from "node:net";

const host = process.env.MT5_READONLY_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.MT5_READONLY_BRIDGE_PORT || 7341);
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || `http://${host}:${port}`).replace(/\/$/, "");
const timeoutMs = Number(process.env.MT5_READONLY_DIAGNOSE_TIMEOUT_MS || 2000);

const probePort = () =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });

const fetchWithTimeout = async (path) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeUrl}/${path}`.replace(/\/$/, ""), {
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
  } catch (error) {
    return {
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
};

const portOpen = await probePort();
const health = await fetchWithTimeout("health");
const status = await fetchWithTimeout("status");
const candles = await fetchWithTimeout("candles?symbol=MNQ&timeframe=5m&limit=5");

const payload = health.payload && typeof health.payload === "object" ? health.payload : undefined;
const statusPayload = status.payload && typeof status.payload === "object" ? status.payload : undefined;
const isMt5Wrapper =
  payload?.provider === "mt5_read_only" ||
  statusPayload?.provider === "mt5_read_only" ||
  statusPayload?.connectionStatus === "connected" ||
  statusPayload?.connectionStatus === "planned";
const diagnosticStatus = !portOpen
  ? "free"
  : health.ok && isMt5Wrapper
    ? statusPayload?.connectionStatus === "connected"
      ? "healthy_mt5_readonly_bridge"
      : "mt5_readonly_bridge_planned_or_disconnected"
    : health.ok
      ? "wrong_process_or_unknown_http_service"
      : "occupied_unresponsive";
const nextRecommendedAction = diagnosticStatus === "free"
  ? "Start a local MT5 read-only bridge when you are ready: npm.cmd run mt5:readonly-bridge"
  : diagnosticStatus === "healthy_mt5_readonly_bridge"
    ? "Use Command Center or Market Data to fetch MT5 quote/candles."
    : diagnosticStatus === "mt5_readonly_bridge_planned_or_disconnected"
      ? "Connect a real local MT5 read-only service that implements the documented endpoints, or keep using imported/TradingView data."
      : "Inspect the process occupying port 7341 before starting the GoTrader MT5 read-only bridge.";

console.log(`MT5 read-only bridge diagnostic: ${bridgeUrl}`);
console.log(`Port open: ${portOpen ? "yes" : "no"}`);
console.log(`Status: ${diagnosticStatus}`);
console.log(`GET /health: ${health.ok ? "ok" : "failed"} (${health.status})`);
console.log(`GET /status: ${status.ok ? "ok" : "failed"} (${status.status})`);
console.log(`GET /candles: ${candles.ok ? "ok" : "failed"} (${candles.status})`);
console.log(`Next action: ${nextRecommendedAction}`);
console.log(
  JSON.stringify(
    {
      bridgeUrl,
      portOpen,
      diagnosticStatus,
      health: health.payload ?? health.error,
      status: status.payload ?? status.error,
      candles: candles.payload && typeof candles.payload === "object"
        ? {
            connectionStatus: candles.payload.connectionStatus,
            returnedCount: candles.payload.returnedCount,
            depthStatus: candles.payload.depthStatus,
            missingEvidence: candles.payload.missingEvidence
          }
        : candles.error,
      nextRecommendedAction
    },
    null,
    2
  )
);

process.exitCode = 0;
