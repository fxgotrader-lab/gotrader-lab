import { createServer } from "node:http";
import {
  classifyMt5ReadOnlyTool,
  isBlockedMt5MutationPath,
  mt5ReadOnlyAllowedTools,
  mt5ReadOnlyBlockedTools
} from "./mt5-readonly-tool-policy.mjs";

const host = process.env.MT5_READONLY_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.MT5_READONLY_BRIDGE_PORT || 7341);
const upstreamBaseUrl = (process.env.MT5_READONLY_UPSTREAM_BASE_URL || "").replace(/\/$/, "");
const upstreamTransport = process.env.MT5_READONLY_UPSTREAM_TRANSPORT || "rest";
const upstreamTimeoutMs = Number(process.env.MT5_READONLY_UPSTREAM_TIMEOUT_MS || 2500);
const defaultRequestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const defaultBrokerSymbol =
  process.env.MT5_READONLY_BROKER_SYMBOL ||
  process.env.MT5_READONLY_DEFAULT_SYMBOL ||
  defaultRequestedSymbol;
const brokerSymbolSuggestions = ["USTECH", "US500", "US30", "XAUUSD", "EURUSD.pro", "EURUSD", "NAS100", "US100"];
const configuredUpstreamPaths = {
  status: process.env.MT5_READONLY_UPSTREAM_STATUS_PATH,
  quote: process.env.MT5_READONLY_UPSTREAM_QUOTE_PATH,
  candles: process.env.MT5_READONLY_UPSTREAM_CANDLES_PATH,
  symbols: process.env.MT5_READONLY_UPSTREAM_SYMBOLS_PATH,
  symbolInfo: process.env.MT5_READONLY_UPSTREAM_SYMBOL_INFO_PATH
};
const upstreamPathCandidates = {
  status: [configuredUpstreamPaths.status, "/health", "/status", "/api/v1/market/symbols", "/symbols"].filter(Boolean),
  quote: [configuredUpstreamPaths.quote, "/quote", "/price", "/tick", "/api/v1/market/price"].filter(Boolean),
  candles: [
    configuredUpstreamPaths.candles,
    "/candles",
    "/rates",
    "/ohlcv",
    "/api/v1/market/candles/latest"
  ].filter(Boolean),
  symbols: [configuredUpstreamPaths.symbols, "/symbols", "/api/v1/market/symbols"].filter(Boolean),
  symbolInfo: [
    configuredUpstreamPaths.symbolInfo,
    "/symbol-info",
    "/symbol_info",
    "/api/v1/market/symbol/info"
  ].filter(Boolean)
};
const startedAt = new Date();
let requestCount = 0;
let lastUpstreamError;
const discoveredUpstreamPaths = {};

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
  connectionStatus: upstreamBaseUrl ? "degraded" : "planned",
  endpoint: `http://${host}:${port}`,
  upstreamConfigured: Boolean(upstreamBaseUrl),
  upstreamTransport,
  upstreamBaseUrl: upstreamBaseUrl || undefined,
  wrapperStatus: "running",
  message: upstreamBaseUrl
    ? "GoTrader MT5 read-only wrapper is running with an upstream market-data endpoint configured."
    : "GoTrader MT5 read-only bridge contract stub is running, but no MT5 terminal connector is configured.",
  warnings: [
    "This wrapper exposes quotes/candles contract endpoints only.",
    "It does not call MT5 orders, positions, account mutation, or execution methods.",
    upstreamBaseUrl
      ? "Only market-data paths are called; arbitrary MCP tools are not exposed to the frontend."
      : "Connect a local read-only MT5 data service to replace this planned/disconnected stub.",
    lastUpstreamError ? `Last upstream error: ${lastUpstreamError}` : undefined
  ].filter(Boolean),
  upstreamPaths: {
    status: discoveredUpstreamPaths.status ?? configuredUpstreamPaths.status,
    quote: discoveredUpstreamPaths.quote ?? configuredUpstreamPaths.quote,
    candles: discoveredUpstreamPaths.candles ?? configuredUpstreamPaths.candles,
    symbols: discoveredUpstreamPaths.symbols ?? configuredUpstreamPaths.symbols,
    symbolInfo: discoveredUpstreamPaths.symbolInfo ?? configuredUpstreamPaths.symbolInfo
  },
  defaultRequestedSymbol,
  defaultBrokerSymbol,
  upstreamCandidatePaths: {
    status: upstreamPathCandidates.status,
    quote: upstreamPathCandidates.quote,
    candles: upstreamPathCandidates.candles,
    symbols: upstreamPathCandidates.symbols,
    symbolInfo: upstreamPathCandidates.symbolInfo
  },
  startedAt: startedAt.toISOString(),
  uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
  requestCount,
  lastCheckedAt: new Date().toISOString(),
  safeToolAllowlist: [...mt5ReadOnlyAllowedTools],
  blockedToolFamilies: [...mt5ReadOnlyBlockedTools],
  ...authority
});

const disconnectedQuote = ({ requestedSymbol, brokerSymbol }) => ({
  provider: "mt5_read_only",
  symbol: brokerSymbol,
  requestedSymbol,
  brokerSymbol,
  connectionStatus: "planned",
  warnings: ["No local MT5 read-only quote connector is configured."],
  missingEvidence: ["Start or connect a local MT5 read-only service that implements GET /quote."],
  timestamp: new Date().toISOString(),
  ...authority
});

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const parseTimestamp = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
};
const mt5TimeframeFor = (timeframe) => ({
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "30m": "M30",
  "1h": "H1",
  "4h": "H4",
  "1d": "D1",
  M1: "M1",
  M5: "M5",
  M15: "M15",
  M30: "M30",
  H1: "H1",
  H4: "H4",
  D1: "D1"
}[timeframe] ?? timeframe);
const upstreamUrl = (path, params = {}) => {
  const url = new URL(`${upstreamBaseUrl}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};
const safeBodyPreview = (value, maxLength = 700) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
const upstreamRequestFor = (path, params = {}) => {
  const brokerSymbol = params.symbol_name ?? params.symbol;

  if (path === "/api/v1/market/candles/latest") {
    return {
      path,
      params: {
        symbol_name: brokerSymbol,
        timeframe: params.mt5_timeframe ?? params.mt5Timeframe ?? mt5TimeframeFor(params.timeframe),
        count: params.count ?? params.limit
      }
    };
  }

  if (path === "/api/v1/market/price") {
    return {
      path,
      params: {
        symbol_name: brokerSymbol
      }
    };
  }

  if (path === "/api/v1/market/symbol/info") {
    return {
      path: `${path}/${encodeURIComponent(brokerSymbol)}`,
      params: {}
    };
  }

  return { path, params };
};
const fetchUpstreamPath = async (path, params) => {
  if (!upstreamBaseUrl) {
    throw new Error("MT5_READONLY_UPSTREAM_BASE_URL is not configured.");
  }
  const request = upstreamRequestFor(path, params);
  const requestUrl = upstreamUrl(request.path, request.params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    const response = await fetch(requestUrl, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      const body = safeBodyPreview(await response.text().catch(() => ""));
      throw new Error(`HTTP ${response.status} from ${requestUrl}${body ? `; body: ${body}` : ""}`);
    }
    return await response.json();
  } catch (error) {
    const message = error?.name === "AbortError"
      ? `timeout after ${upstreamTimeoutMs}ms`
      : error instanceof Error
        ? error.message
        : String(error);
    throw new Error(message.includes(requestUrl) ? message : `${message} while requesting ${requestUrl}`);
  } finally {
    clearTimeout(timeout);
  }
};
const fetchUpstreamJson = async (kind, params, validator = () => true) => {
  const candidates = [
    discoveredUpstreamPaths[kind],
    ...(upstreamPathCandidates[kind] ?? [])
  ].filter(Boolean);
  const errors = [];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const payload = await fetchUpstreamPath(candidate, params);
      if (validator(payload)) {
        discoveredUpstreamPaths[kind] = candidate;
        return { payload, path: candidate };
      }
      errors.push(`${candidate}: response shape did not satisfy ${kind} validator`);
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No safe upstream ${kind} endpoint responded. Tried: ${errors.join("; ")}`);
};
const payloadArray = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.candles)) {
    return payload.candles;
  }
  if (Array.isArray(payload?.rates)) {
    return payload.rates;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
};
const discoverBrokerSymbolSuggestions = async () => {
  if (!upstreamBaseUrl) {
    return [];
  }
  try {
    const { payload } = await fetchUpstreamJson("symbols", {}, (candidate) => Array.isArray(candidate) || payloadArray(candidate).length > 0);
    const symbols = payloadArray(payload).map((item) => String(item?.name ?? item?.symbol ?? item)).filter(Boolean);
    const normalized = new Map(symbols.map((symbol) => [symbol.toUpperCase(), symbol]));
    const discovered = brokerSymbolSuggestions
      .map((symbol) => normalized.get(symbol.toUpperCase()))
      .filter(Boolean);
    return [...new Set(discovered.length ? discovered : brokerSymbolSuggestions)];
  } catch {
    return brokerSymbolSuggestions;
  }
};
const failureEvidence = async ({ action, brokerSymbol, error }) => {
  const message = error instanceof Error ? error.message : String(error);
  const suggestions = await discoverBrokerSymbolSuggestions();
  return [
    `Configured MT5 upstream ${action} endpoint failed for brokerSymbol=${brokerSymbol}: ${message}`,
    suggestions.length ? `Broker symbols to try from the MT5 symbol list/common aliases: ${suggestions.join(", ")}` : undefined
  ].filter(Boolean);
};
const priceLikePayload = (payload) => {
  const data = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data : payload;
  return [
    data?.bid,
    data?.bid_price,
    data?.price?.bid,
    data?.ask,
    data?.ask_price,
    data?.price?.ask,
    data?.mid,
    data?.last,
    data?.price,
    data?.close
  ].some((value) => toNumber(value) !== undefined);
};
const candleLikePayload = (payload) =>
  payloadArray(payload).some((item) =>
    toNumber(firstDefined(item.open, item.o)) !== undefined &&
    toNumber(firstDefined(item.high, item.h)) !== undefined &&
    toNumber(firstDefined(item.low, item.l)) !== undefined &&
    toNumber(firstDefined(item.close, item.c)) !== undefined
  );
const normalizeQuote = ({ payload, requestedSymbol, brokerSymbol, sourcePath }) => {
  const data = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data : payload;
  const bid = toNumber(firstDefined(data?.bid, data?.bid_price, data?.price?.bid));
  const ask = toNumber(firstDefined(data?.ask, data?.ask_price, data?.price?.ask));
  const upstreamMid = toNumber(firstDefined(data?.mid, data?.last, data?.price, data?.close));
  const mid = upstreamMid && upstreamMid > 0 ? upstreamMid : bid !== undefined && ask !== undefined ? (bid + ask) / 2 : upstreamMid;
  const spread = toNumber(firstDefined(data?.spread, data?.spread_points)) ?? (bid !== undefined && ask !== undefined ? ask - bid : undefined);
  return {
    provider: "mt5_read_only",
    symbol: data?.symbol ?? brokerSymbol,
    requestedSymbol,
    brokerSymbol: data?.symbol ?? brokerSymbol,
    bid,
    ask,
    mid,
    spread,
    timestamp: parseTimestamp(firstDefined(data?.timestamp, data?.time, data?.datetime)),
    connectionStatus: bid !== undefined || ask !== undefined || mid !== undefined ? "connected" : "degraded",
    sourceMethod: sourcePath ? `upstream_http:${sourcePath}` : undefined,
    warnings: ["MT5 quote was retrieved through the GoTrader read-only wrapper; no execution authority."],
    missingEvidence: bid === undefined && ask === undefined && mid === undefined ? ["Upstream quote payload did not include bid/ask/mid price fields."] : [],
    ...authority
  };
};
const normalizeCandles = ({ payload, brokerSymbol, timeframe, limit }) => {
  const seen = new Set();
  const candles = payloadArray(payload)
    .map((item, index) => {
      const timestamp = parseTimestamp(firstDefined(item.timestamp, item.time, item.datetime, item.date));
      const time = Math.floor(Date.parse(timestamp) / 1000);
      const candle = {
        id: `mt5_read_only_${brokerSymbol}_${time}_${index}`,
        time,
        timestamp,
        open: toNumber(firstDefined(item.open, item.o)),
        high: toNumber(firstDefined(item.high, item.h)),
        low: toNumber(firstDefined(item.low, item.l)),
        close: toNumber(firstDefined(item.close, item.c)),
        volume: toNumber(firstDefined(item.volume, item.real_volume)),
        tickVolume: toNumber(firstDefined(item.tickVolume, item.tick_volume, item.tickvolume)),
        spread: toNumber(item.spread),
        source: "mt5_read_only",
        symbol: brokerSymbol,
        timeframe
      };
      return candle;
    })
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    )
    .sort((a, b) => a.time - b.time)
    .filter((candle) => {
      if (seen.has(candle.time)) {
        return false;
      }
      seen.add(candle.time);
      return true;
    })
    .slice(-limit);
  return candles;
};

const disconnectedCandles = ({ requestedSymbol, brokerSymbol, timeframe, limit }) => ({
  provider: "mt5_read_only",
  symbol: brokerSymbol,
  requestedSymbol,
  brokerSymbol,
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

const upstreamQuote = async ({ requestedSymbol, brokerSymbol }) => {
  const { payload, path } = await fetchUpstreamJson("quote", {
    symbol_name: brokerSymbol,
    symbol: brokerSymbol
  }, priceLikePayload);
  return normalizeQuote({ payload, requestedSymbol, brokerSymbol, sourcePath: path });
};

const upstreamCandles = async ({ requestedSymbol, brokerSymbol, timeframe, limit }) => {
  const mt5Timeframe = mt5TimeframeFor(timeframe);
  const { payload, path } = await fetchUpstreamJson("candles", {
    symbol_name: brokerSymbol,
    symbol: brokerSymbol,
    timeframe,
    mt5_timeframe: mt5Timeframe,
    mt5Timeframe,
    count: limit,
    limit
  }, candleLikePayload);
  const candles = normalizeCandles({ payload, brokerSymbol, timeframe, limit });
  return {
    provider: "mt5_read_only",
    symbol: brokerSymbol,
    requestedSymbol,
    brokerSymbol,
    timeframe,
    requestedTimeframe: timeframe,
    requestedLimit: limit,
    returnedCount: candles.length,
    candles,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles[candles.length - 1]?.timestamp,
    connectionStatus: candles.length ? "connected" : "degraded",
    depthStatus: candles.length >= limit ? "full" : candles.length ? "partial" : "insufficient_history",
    sourceMethod: `upstream_http:${path}`,
    warnings: ["MT5 candles were retrieved through the GoTrader read-only wrapper; no execution authority."],
    missingEvidence: candles.length ? [] : ["Upstream candle payload did not include a valid OHLCV series."],
    ...authority
  };
};

const server = createServer(async (req, res) => {
  requestCount += 1;
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${host}:${port}`);
  const requestedSymbol = url.searchParams.get("requestedSymbol") || url.searchParams.get("gotraderSymbol") || defaultRequestedSymbol;
  const symbol = url.searchParams.get("symbol") || url.searchParams.get("brokerSymbol") || defaultBrokerSymbol;
  const timeframe = url.searchParams.get("timeframe") || "5m";
  const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 240)));

  if (req.method !== "GET") {
    json(res, 405, {
      provider: "mt5_read_only",
      connectionStatus: "error",
      message: "GoTrader MT5 read-only wrapper accepts GET/OPTIONS only. Tool calls and order mutations are not exposed.",
      ...authority
    });
    return;
  }

  if (isBlockedMt5MutationPath(url.pathname)) {
    json(res, 403, {
      provider: "mt5_read_only",
      connectionStatus: "error",
      toolPolicy: classifyMt5ReadOnlyTool(url.pathname),
      message: "Blocked by GoTrader MT5 read-only policy. Execution, account, order, position, pending-order, and history tools are not callable.",
      ...authority
    });
    return;
  }

  if (url.pathname === "/tool-policy") {
    const tool = url.searchParams.get("tool") || "";
    json(res, 200, {
      provider: "mt5_read_only",
      tool,
      policy: classifyMt5ReadOnlyTool(tool),
      allowedTools: [...mt5ReadOnlyAllowedTools],
      blockedTools: [...mt5ReadOnlyBlockedTools],
      ...authority
    });
    return;
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    json(res, 200, plannedStatus());
    return;
  }

  if (url.pathname === "/status") {
    if (!upstreamBaseUrl) {
      json(res, 200, plannedStatus());
      return;
    }
    try {
      await fetchUpstreamJson("status", {});
      lastUpstreamError = undefined;
      json(res, 200, {
        ...plannedStatus(),
        connectionStatus: "connected",
        message: "GoTrader MT5 read-only wrapper reached the configured upstream market-data service."
      });
    } catch (error) {
      lastUpstreamError = error instanceof Error ? error.message : String(error);
      json(res, 200, {
        ...plannedStatus(),
        connectionStatus: "degraded",
        message: "GoTrader MT5 read-only wrapper is running, but upstream market-data status failed."
      });
    }
    return;
  }

  if (url.pathname === "/quote") {
    if (!upstreamBaseUrl) {
      json(res, 200, disconnectedQuote({ requestedSymbol, brokerSymbol: symbol }));
      return;
    }
    try {
      const quote = await upstreamQuote({ requestedSymbol, brokerSymbol: symbol });
      lastUpstreamError = undefined;
      json(res, 200, quote);
    } catch (error) {
      lastUpstreamError = error instanceof Error ? error.message : String(error);
      json(res, 200, {
        ...disconnectedQuote({ requestedSymbol, brokerSymbol: symbol }),
        connectionStatus: "degraded",
        missingEvidence: await failureEvidence({ action: "quote", brokerSymbol: symbol, error })
      });
    }
    return;
  }

  if (url.pathname === "/candles") {
    if (!upstreamBaseUrl) {
      json(res, 200, disconnectedCandles({ requestedSymbol, brokerSymbol: symbol, timeframe, limit }));
      return;
    }
    try {
      const candles = await upstreamCandles({ requestedSymbol, brokerSymbol: symbol, timeframe, limit });
      lastUpstreamError = undefined;
      json(res, 200, candles);
    } catch (error) {
      lastUpstreamError = error instanceof Error ? error.message : String(error);
      json(res, 200, {
        ...disconnectedCandles({ requestedSymbol, brokerSymbol: symbol, timeframe, limit }),
        connectionStatus: "degraded",
        missingEvidence: await failureEvidence({ action: "candle", brokerSymbol: symbol, error })
      });
    }
    return;
  }

  if (url.pathname === "/snapshot") {
    if (upstreamBaseUrl) {
      const quote = await upstreamQuote({ requestedSymbol, brokerSymbol: symbol }).catch((error) => {
        lastUpstreamError = error instanceof Error ? error.message : String(error);
        return disconnectedQuote({ requestedSymbol, brokerSymbol: symbol });
      });
      const candles = await upstreamCandles({ requestedSymbol, brokerSymbol: symbol, timeframe, limit }).catch((error) => {
        lastUpstreamError = error instanceof Error ? error.message : String(error);
        return disconnectedCandles({ requestedSymbol, brokerSymbol: symbol, timeframe, limit });
      });
      json(res, 200, {
        provider: "mt5_read_only",
        status: plannedStatus(),
        quote,
        candles,
        ...authority
      });
      return;
    }
    json(res, 200, {
      provider: "mt5_read_only",
      status: plannedStatus(),
      quote: disconnectedQuote({ requestedSymbol, brokerSymbol: symbol }),
      candles: disconnectedCandles({ requestedSymbol, brokerSymbol: symbol, timeframe, limit }),
      ...authority
    });
    return;
  }

  if (url.pathname === "/symbols") {
    if (upstreamBaseUrl) {
      try {
        const { payload, path } = await fetchUpstreamJson("symbols", {});
        const symbols = payloadArray(payload);
        lastUpstreamError = undefined;
        json(res, 200, {
          provider: "mt5_read_only",
          connectionStatus: "connected",
          symbols,
          sourceMethod: `upstream_http:${path}`,
          warnings: ["Symbols were retrieved through the GoTrader read-only wrapper."],
          missingEvidence: [],
          ...authority
        });
      } catch (error) {
        lastUpstreamError = error instanceof Error ? error.message : String(error);
        json(res, 200, {
          provider: "mt5_read_only",
          connectionStatus: "degraded",
          symbols: [],
          warnings: ["Configured upstream symbols endpoint failed."],
          missingEvidence: [lastUpstreamError],
          ...authority
        });
      }
      return;
    }
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

  if (url.pathname === "/symbol-info") {
    if (!upstreamBaseUrl) {
      json(res, 200, {
        provider: "mt5_read_only",
        connectionStatus: "planned",
        symbol,
        warnings: ["No local MT5 read-only symbol-info connector is configured."],
        missingEvidence: ["Connect a local read-only MT5 data service that implements symbol info."],
        ...authority
      });
      return;
    }
    try {
      const { payload, path } = await fetchUpstreamJson("symbolInfo", { symbol_name: symbol, symbol });
      lastUpstreamError = undefined;
      json(res, 200, {
        provider: "mt5_read_only",
        connectionStatus: "connected",
        symbol,
        symbolInfo: payload,
        sourceMethod: `upstream_http:${path}`,
        warnings: ["Symbol info was retrieved through the GoTrader read-only wrapper."],
        missingEvidence: [],
        ...authority
      });
    } catch (error) {
      lastUpstreamError = error instanceof Error ? error.message : String(error);
      json(res, 200, {
        provider: "mt5_read_only",
        connectionStatus: "degraded",
        symbol,
        warnings: ["Configured upstream symbol-info endpoint failed."],
        missingEvidence: await failureEvidence({ action: "symbol-info", brokerSymbol: symbol, error }),
        ...authority
      });
    }
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
