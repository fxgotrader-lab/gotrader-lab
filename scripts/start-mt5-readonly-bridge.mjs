import { createServer } from "node:http";

const host = process.env.MT5_READONLY_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.MT5_READONLY_BRIDGE_PORT || 7341);
const startedAt = new Date();
let requestCount = 0;

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload, null, 2));
};

const plannedStatus = () => ({
  provider: "mt5_read_only",
  connectionStatus: "planned",
  endpoint: `http://${host}:${port}`,
  wrapperStatus: "running",
  message: "GoTrader MT5 read-only bridge contract stub is running, but no MT5 terminal connector is configured.",
  warnings: [
    "This wrapper exposes quotes/candles contract endpoints only.",
    "It does not call MT5 orders, positions, account mutation, or execution methods.",
    "Connect a local read-only MT5 data service to replace this planned/disconnected stub."
  ],
  startedAt: startedAt.toISOString(),
  uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
  requestCount,
  lastCheckedAt: new Date().toISOString(),
  ...authority
});

const disconnectedQuote = (symbol) => ({
  provider: "mt5_read_only",
  symbol,
  brokerSymbol: symbol,
  connectionStatus: "planned",
  warnings: ["No local MT5 read-only quote connector is configured."],
  missingEvidence: ["Start or connect a local MT5 read-only service that implements GET /quote."],
  timestamp: new Date().toISOString(),
  ...authority
});

const disconnectedCandles = ({ symbol, timeframe, limit }) => ({
  provider: "mt5_read_only",
  symbol,
  requestedSymbol: symbol,
  brokerSymbol: symbol,
  timeframe,
  requestedTimeframe: timeframe,
  requestedLimit: limit,
  returnedCount: 0,
  candles: [],
  connectionStatus: "planned",
  depthStatus: "disconnected",
  sourceMethod: "contract_stub",
  warnings: ["No local MT5 read-only candle connector is configured."],
  missingEvidence: ["Start or connect a local MT5 read-only service that implements GET /candles."],
  ...authority
});

const server = createServer((req, res) => {
  requestCount += 1;
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${host}:${port}`);
  const symbol = url.searchParams.get("symbol") || "MNQ";
  const timeframe = url.searchParams.get("timeframe") || "5m";
  const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 240)));

  if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/status") {
    json(res, 200, plannedStatus());
    return;
  }

  if (url.pathname === "/quote") {
    json(res, 200, disconnectedQuote(symbol));
    return;
  }

  if (url.pathname === "/candles") {
    json(res, 200, disconnectedCandles({ symbol, timeframe, limit }));
    return;
  }

  if (url.pathname === "/snapshot") {
    json(res, 200, {
      provider: "mt5_read_only",
      status: plannedStatus(),
      quote: disconnectedQuote(symbol),
      candles: disconnectedCandles({ symbol, timeframe, limit }),
      ...authority
    });
    return;
  }

  if (url.pathname === "/symbols") {
    json(res, 200, {
      provider: "mt5_read_only",
      connectionStatus: "planned",
      symbols: [],
      warnings: ["No local MT5 symbol list connector is configured."],
      missingEvidence: ["Connect a local read-only MT5 data service that implements GET /symbols."],
      ...authority
    });
    return;
  }

  json(res, 404, {
    provider: "mt5_read_only",
    connectionStatus: "error",
    message: `Unknown MT5 read-only bridge endpoint: ${url.pathname}`,
    ...authority
  });
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`MT5 read-only bridge port ${port} is already in use.`);
    console.error(`Check http://${host}:${port}/health or stop the process occupying the port before restarting.`);
    process.exitCode = 1;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`GoTrader MT5 read-only bridge contract stub listening at http://${host}:${port}`);
  console.log("Status: planned/disconnected until a local MT5 read-only connector is configured.");
  console.log("Authority: execution none, broker none, readiness override none.");
});
