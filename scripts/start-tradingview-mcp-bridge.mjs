import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { compactProcess, diagnoseBridgePort } from "./tradingview-bridge-port-utils.mjs";

const host = process.env.TRADINGVIEW_MCP_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.TRADINGVIEW_MCP_BRIDGE_PORT || 7331);
const repoDir = process.env.TRADINGVIEW_MCP_REPO_DIR ? resolve(process.env.TRADINGVIEW_MCP_REPO_DIR) : "";
const cliPath = process.env.TRADINGVIEW_MCP_CLI
  ? resolve(process.env.TRADINGVIEW_MCP_CLI)
  : repoDir
    ? join(repoDir, "src", "cli", "index.js")
    : "";
const nodeBin = process.env.TRADINGVIEW_MCP_NODE || process.execPath;
const cliTimeoutMs = Number(process.env.TRADINGVIEW_MCP_CLI_TIMEOUT_MS || 8000);

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload, null, 2));
};

const readBody = async (req) =>
  new Promise((resolveBody) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text.trim()) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(text));
      } catch {
        resolveBody({});
      }
    });
  });

const parseCliJson = (text) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonLine = trimmed
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith("{") || line.trim().startsWith("["));
    if (!jsonLine) {
      return { text: trimmed };
    }
    try {
      return JSON.parse(jsonLine);
    } catch {
      return { text: trimmed };
    }
  }
};

const runCli = (args) =>
  new Promise((resolveRun) => {
    if (!cliPath || !existsSync(cliPath)) {
      resolveRun({
        ok: false,
        status: "not_configured",
        error: "Set TRADINGVIEW_MCP_REPO_DIR or TRADINGVIEW_MCP_CLI to a local tradingview-mcp clone."
      });
      return;
    }

    const child = spawn(nodeBin, [cliPath, ...args], {
      cwd: repoDir || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolveRun({
        ok: false,
        status: "timeout",
        error: `TradingView MCP CLI timed out after ${cliTimeoutMs}ms.`
      });
    }, cliTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveRun({
        ok: code === 0,
        status: code === 0 ? "ok" : "error",
        code,
        payload: parseCliJson(stdout),
        error: stderr.trim() || undefined
      });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveRun({
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });

const compactNumber = (value) => {
  const numeric = typeof value === "string" ? Number(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : undefined;
};

const latestPriceFromQuote = (quote) =>
  compactNumber(quote?.close ?? quote?.last ?? quote?.price ?? quote?.lp ?? quote?.bid ?? quote?.ask);

const UPSTREAM_OHLCV_MAX_BARS = 500;
const RESEARCH_MINIMUM_CANDLES = 400;

const normalizeRequestedLimit = (value) => {
  const numeric = Number(value ?? 100);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(1000, Math.floor(numeric))) : 100;
};

const effectiveOhlcvLimit = (requestedLimit) => Math.min(UPSTREAM_OHLCV_MAX_BARS, requestedLimit);

const inferDepthMetadata = ({ effectiveLimit, ohlcvResult, requestedLimit, returnedCount }) => {
  const upstreamTotalAvailable = compactNumber(
    ohlcvResult.payload?.total_available ??
      ohlcvResult.payload?.totalAvailable ??
      ohlcvResult.payload?.total_bars ??
      ohlcvResult.payload?.totalBars
  );
  const requestedLabel = requestedLimit.toLocaleString();
  const returnedLabel = returnedCount.toLocaleString();
  const warnings = [];
  let depthStatus = "unknown";
  let depthWarning;
  let nextRecommendedAction = "Use imported historical data for research if deeper TradingView history is unavailable.";

  if (returnedCount >= requestedLimit) {
    depthStatus = "full";
    nextRecommendedAction = "TradingView MCP returned the requested candle depth.";
  } else if (!ohlcvResult.ok) {
    depthStatus = "unknown";
    depthWarning = "TradingView MCP OHLCV command failed, so candle depth could not be verified.";
    nextRecommendedAction = "Check TradingView Desktop, CDP port 9222, and the local wrapper.";
  } else if (returnedCount === 0) {
    depthStatus = "unknown";
    depthWarning = `TradingView MCP returned 0 of ${requestedLabel} requested candles.`;
    nextRecommendedAction = "Open a TradingView chart with loaded OHLCV bars, then fetch again.";
  } else if (upstreamTotalAvailable !== undefined && upstreamTotalAvailable <= returnedCount && returnedCount < effectiveLimit) {
    depthStatus = "visible_history_limited";
    depthWarning = `TradingView MCP returned ${returnedLabel} of ${requestedLabel} requested candles because the current TradingView Desktop chart appears to have ${upstreamTotalAvailable.toLocaleString()} bars loaded.`;
    nextRecommendedAction = "Scroll/load more TradingView chart history or use imported historical data for research.";
  } else if (requestedLimit > UPSTREAM_OHLCV_MAX_BARS && returnedCount >= UPSTREAM_OHLCV_MAX_BARS) {
    depthStatus = "capped_by_upstream";
    depthWarning = `TradingView MCP returned ${returnedLabel} of ${requestedLabel} requested candles because upstream ohlcv is capped at ${UPSTREAM_OHLCV_MAX_BARS.toLocaleString()} bars per call.`;
    nextRecommendedAction = "Use imported historical data for larger walk-forward/research windows until upstream supports deeper OHLCV history.";
  } else if (returnedCount < requestedLimit) {
    depthStatus = "partial";
    depthWarning = `TradingView MCP returned ${returnedLabel} of ${requestedLabel} requested candles.`;
    nextRecommendedAction = "Try fetching again after loading more TradingView chart history, or use imported historical data.";
  }

  if (requestedLimit > UPSTREAM_OHLCV_MAX_BARS) {
    warnings.push(
      `Upstream tradingview-mcp ohlcv accepts --count but caps requests at ${UPSTREAM_OHLCV_MAX_BARS.toLocaleString()} bars per call.`
    );
  }
  if (returnedCount < RESEARCH_MINIMUM_CANDLES) {
    warnings.push(
      `TradingView MCP returned ${returnedLabel} candles; GoTrader research-source eligibility still requires at least ${RESEARCH_MINIMUM_CANDLES.toLocaleString()} valid candles.`
    );
  }
  if (depthWarning) {
    warnings.push(depthWarning);
  }

  return {
    requestedLimit,
    effectiveLimit,
    returnedCount,
    upstreamMaxBars: UPSTREAM_OHLCV_MAX_BARS,
    upstreamTotalAvailable,
    researchMinimumCandles: RESEARCH_MINIMUM_CANDLES,
    depthStatus,
    depthWarning,
    nextRecommendedAction,
    depthWarnings: warnings
  };
};

const timestampFromTradingViewTime = (value) => {
  if (value === undefined || value === null) {
    return new Date().toISOString();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return timestampFromTradingViewTime(numeric);
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 9_999_999_999 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  return new Date().toISOString();
};

const normalizeTradingViewBar = (bar, index, symbol, timeframe) => {
  const open = compactNumber(bar?.open);
  const high = compactNumber(bar?.high);
  const low = compactNumber(bar?.low);
  const close = compactNumber(bar?.close);
  const time = compactNumber(bar?.time ?? bar?.timestamp);
  if (![open, high, low, close, time].every((value) => typeof value === "number")) {
    return undefined;
  }
  const timestamp = timestampFromTradingViewTime(time);
  return {
    id: `tradingview_mcp_${symbol}_${timeframe}_${time}_${index}`,
    time,
    timestamp,
    open,
    high,
    low,
    close,
    volume: compactNumber(bar?.volume) ?? 0,
    source: "tradingview_mcp",
    symbol,
    timeframe
  };
};

const normalizeTradingViewCandles = ({ ohlcvResult, symbol, timeframe, limit }) => {
  const bars = Array.isArray(ohlcvResult.payload?.bars) ? ohlcvResult.payload.bars : [];
  const candles = bars
    .map((bar, index) => normalizeTradingViewBar(bar, index, symbol, timeframe))
    .filter(Boolean)
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
  return candles;
};

const candleSummary = (candles) => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return {
    candleCount: candles.length,
    firstTimestamp: first?.timestamp,
    lastTimestamp: last?.timestamp,
    latestOpen: last?.open,
    latestHigh: last?.high,
    latestLow: last?.low,
    latestClose: last?.close,
    latestVolume: last?.volume
  };
};

const buildEvidence = ({ symbol, timeframe, statusResult, quoteResult, ohlcvResult }) => {
  const quote = quoteResult.payload ?? {};
  const ohlcv = ohlcvResult.payload ?? {};
  const latestPrice = latestPriceFromQuote(quote);
  const warnings = [
    "TradingView MCP evidence is advisory chart context only, not broker truth.",
    !statusResult.ok ? "TradingView status check failed or is not configured." : undefined,
    !quoteResult.ok ? "TradingView quote evidence unavailable." : undefined,
    !ohlcvResult.ok ? "TradingView OHLCV summary unavailable." : undefined
  ].filter(Boolean);

  return {
    symbol: String(quote.symbol ?? ohlcv.symbol ?? symbol ?? "unknown"),
    timeframe: String(ohlcv.timeframe ?? ohlcv.interval ?? timeframe ?? "unknown"),
    chartSource: "local_tradingview_mcp_cli_wrapper",
    latestPrice,
    ohlcvSummary: {
      candleCount: compactNumber(ohlcv.candleCount ?? ohlcv.count ?? ohlcv.bars),
      firstTimestamp: ohlcv.firstTimestamp ?? ohlcv.from,
      lastTimestamp: ohlcv.lastTimestamp ?? ohlcv.to ?? quote.time ?? quote.timestamp,
      latestOpen: compactNumber(ohlcv.latestOpen ?? ohlcv.open),
      latestHigh: compactNumber(ohlcv.latestHigh ?? ohlcv.high),
      latestLow: compactNumber(ohlcv.latestLow ?? ohlcv.low),
      latestClose: compactNumber(ohlcv.latestClose ?? ohlcv.close ?? latestPrice),
      latestVolume: compactNumber(ohlcv.latestVolume ?? ohlcv.volume)
    },
    technicalSummary: latestPrice
      ? `TradingView MCP read-only evidence loaded. Latest visible price is ${latestPrice}.`
      : "TradingView MCP wrapper responded, but latest price evidence was unavailable.",
    levels: [],
    supportResistance: [],
    indicators: [],
    patterns: [],
    trendState: "unclear",
    chartBias: "unclear",
    bias: "unclear",
    confidence: latestPrice ? 0.35 : 0.1,
    warnings,
    missingEvidence: [
      "Detected levels require a custom TradingView/Pine overlay or MCP command mapping.",
      "Indicators and screenshots are not collected by this lightweight wrapper yet."
    ],
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
};

const buildQuotePayload = ({ symbol, timeframe, statusResult, quoteResult }) => {
  const quote = quoteResult.payload ?? {};
  const latestPrice = latestPriceFromQuote(quote);
  const statusPayload = statusResult.payload ?? {};
  return {
    provider: "tradingview_mcp",
    symbol: String(quote.symbol ?? symbol ?? "unknown"),
    requestedSymbol: symbol,
    chartSymbol: statusPayload.chart_symbol,
    chartResolution: statusPayload.chart_resolution,
    timeframe,
    latestPrice,
    bid: compactNumber(quote.bid),
    ask: compactNumber(quote.ask),
    open: compactNumber(quote.open),
    high: compactNumber(quote.high),
    low: compactNumber(quote.low),
    close: compactNumber(quote.close ?? quote.last),
    volume: compactNumber(quote.volume),
    timestamp: timestampFromTradingViewTime(quote.time ?? quote.timestamp),
    connectionStatus: statusResult.ok && quoteResult.ok ? "connected" : statusResult.ok ? "degraded" : "disconnected",
    sourceCommand: "quote",
    warnings: [
      "TradingView MCP quote is read-only chart context, not broker truth.",
      !quoteResult.ok ? "TradingView MCP quote command failed." : undefined
    ].filter(Boolean),
    missingEvidence: latestPrice ? [] : ["Latest price unavailable from TradingView MCP quote command."],
    mode: "read_only_chart_data",
    ...authority
  };
};

const buildCandlesPayload = ({ symbol, timeframe, effectiveLimit, requestedLimit, statusResult, ohlcvResult }) => {
  const payloadSymbol = String(ohlcvResult.payload?.symbol ?? symbol ?? "unknown");
  const payloadTimeframe = String(ohlcvResult.payload?.timeframe ?? ohlcvResult.payload?.interval ?? timeframe ?? "unknown");
  const statusPayload = statusResult.payload ?? {};
  const candles = normalizeTradingViewCandles({
    ohlcvResult,
    symbol: payloadSymbol,
    timeframe: payloadTimeframe,
    limit: effectiveLimit
  });
  const first = candles[0];
  const last = candles[candles.length - 1];
  const depth = inferDepthMetadata({
    effectiveLimit,
    ohlcvResult,
    requestedLimit,
    returnedCount: candles.length
  });
  return {
    provider: "tradingview_mcp",
    symbol: payloadSymbol,
    requestedSymbol: symbol,
    chartSymbol: statusPayload.chart_symbol,
    chartResolution: statusPayload.chart_resolution,
    timeframe: payloadTimeframe,
    requestedTimeframe: timeframe,
    candles,
    candleCount: candles.length,
    requestedLimit: depth.requestedLimit,
    effectiveLimit: depth.effectiveLimit,
    returnedCount: depth.returnedCount,
    upstreamMaxBars: depth.upstreamMaxBars,
    upstreamTotalAvailable: depth.upstreamTotalAvailable,
    researchMinimumCandles: depth.researchMinimumCandles,
    depthStatus: depth.depthStatus,
    depthWarning: depth.depthWarning,
    nextRecommendedAction: depth.nextRecommendedAction,
    firstTimestamp: first?.timestamp,
    lastTimestamp: last?.timestamp,
    sourceCommand: `ohlcv --count ${effectiveLimit}`,
    connectionStatus: !statusResult.ok
      ? "disconnected"
      : candles.length
        ? "connected_with_candles"
        : "connected_no_candles",
    warnings: [
      "TradingView MCP candles are read-only chart data, not broker truth.",
      !ohlcvResult.ok ? "TradingView MCP OHLCV command failed." : undefined,
      ...depth.depthWarnings
    ].filter(Boolean),
    missingEvidence: candles.length
      ? []
      : ["Full OHLCV candle series unavailable from current CLI command or chart state."],
    mode: "read_only_chart_data",
    ...authority
  };
};

const buildMarketSnapshotPayload = ({ symbol, timeframe, quote, candles, evidence, statusResult }) => ({
  snapshotId: `tradingview_mcp_snapshot_${Date.now().toString(36)}`,
  provider: "tradingview_mcp",
  symbol: candles.symbol ?? quote.symbol ?? symbol,
  requestedSymbol: symbol,
  timeframe: candles.timeframe ?? timeframe,
  timestamp: new Date().toISOString(),
  source: "tradingview_mcp_read_only_chart_feed",
  candles: candles.candles,
  latestPrice: quote.latestPrice,
  bid: quote.bid,
  ask: quote.ask,
  spread:
    typeof quote.ask === "number" && typeof quote.bid === "number" && Number.isFinite(quote.ask - quote.bid)
      ? quote.ask - quote.bid
      : undefined,
  session: "unknown",
  dataQuality: {
    status: candles.candleCount > 0 ? "usable_chart_feed" : "connected_no_candles",
    candleCount: candles.candleCount,
    requestedLimit: candles.requestedLimit,
    returnedCount: candles.returnedCount,
    researchMinimumCandles: candles.researchMinimumCandles,
    depthStatus: candles.depthStatus,
    depthWarning: candles.depthWarning,
    nextRecommendedAction: candles.nextRecommendedAction,
    warnings: [...candles.warnings, ...quote.warnings],
    missingEvidence: [...candles.missingEvidence, ...quote.missingEvidence]
  },
  provenance: {
    provider: "tradingview_mcp",
    sourceCommand: candles.sourceCommand,
    statusPayload: statusResult.ok
      ? {
          chartSymbol: statusResult.payload?.chart_symbol,
          chartResolution: statusResult.payload?.chart_resolution,
          targetUrl: statusResult.payload?.target_url
        }
      : undefined,
    rawProviderPayloadIncluded: false
  },
  evidence,
  mode: "read_only_chart_data",
  ...authority
});

const statusPayload = async () => {
  const statusResult = await runCli(["status"]);
  const configured = Boolean(cliPath && existsSync(cliPath));
  return {
    status: statusResult.ok ? "connected_analysis_only" : configured ? "disconnected" : "wrapper_running_upstream_not_configured",
    message: statusResult.ok
      ? "TradingView MCP CLI responded. Read-only evidence wrapper is available."
      : configured
        ? "TradingView MCP CLI is configured but did not report connected status."
        : "GoTrader wrapper is running. Set TRADINGVIEW_MCP_REPO_DIR to enable upstream TradingView MCP CLI calls.",
    bridge: {
      host,
      port,
      repoDir: repoDir || null,
      cliPath: cliPath || null,
      upstreamCliConfigured: configured
    },
    upstream: {
      ok: statusResult.ok,
      status: statusResult.status,
      error: statusResult.error,
      payload: statusResult.ok ? statusResult.payload : undefined
    },
    mode: "read_only_analysis",
    ...authority
  };
};

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 200, { ok: true });
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/health" || requestUrl.pathname === "/status") {
    json(res, 200, await statusPayload());
    return;
  }

  if (requestUrl.pathname === "/evidence") {
    const body = req.method === "POST" ? await readBody(req) : {};
    const symbol = String(body.symbol ?? requestUrl.searchParams.get("symbol") ?? "unknown");
    const timeframe = String(body.timeframe ?? requestUrl.searchParams.get("timeframe") ?? "unknown");
    const [statusResult, quoteResult, ohlcvResult] = await Promise.all([
      runCli(["status"]),
      runCli(["quote"]),
      runCli(["ohlcv", "--summary"])
    ]);
    const evidence = buildEvidence({ symbol, timeframe, statusResult, quoteResult, ohlcvResult });
    json(res, 200, {
      status: statusResult.ok ? "connected_analysis_only" : "disconnected",
      message: statusResult.ok
        ? "TradingView MCP read-only evidence collected from local CLI."
        : "TradingView MCP evidence unavailable; wrapper returned bounded disconnected evidence.",
      evidence,
      warnings: evidence.warnings,
      mode: "read_only_analysis",
      ...authority
    });
    return;
  }

  if (requestUrl.pathname === "/quote") {
    const symbol = String(requestUrl.searchParams.get("symbol") ?? "unknown");
    const timeframe = String(requestUrl.searchParams.get("timeframe") ?? "unknown");
    const [statusResult, quoteResult] = await Promise.all([
      runCli(["status"]),
      runCli(["quote"])
    ]);
    json(res, 200, buildQuotePayload({ symbol, timeframe, statusResult, quoteResult }));
    return;
  }

  if (requestUrl.pathname === "/candles") {
    const symbol = String(requestUrl.searchParams.get("symbol") ?? "unknown");
    const timeframe = String(requestUrl.searchParams.get("timeframe") ?? "unknown");
    const requestedLimit = normalizeRequestedLimit(requestUrl.searchParams.get("limit"));
    const effectiveLimit = effectiveOhlcvLimit(requestedLimit);
    const [statusResult, ohlcvResult] = await Promise.all([
      runCli(["status"]),
      runCli(["ohlcv", "--count", String(effectiveLimit)])
    ]);
    json(res, 200, buildCandlesPayload({ symbol, timeframe, requestedLimit, effectiveLimit, statusResult, ohlcvResult }));
    return;
  }

  if (requestUrl.pathname === "/snapshot") {
    const symbol = String(requestUrl.searchParams.get("symbol") ?? "unknown");
    const timeframe = String(requestUrl.searchParams.get("timeframe") ?? "unknown");
    const requestedLimit = normalizeRequestedLimit(requestUrl.searchParams.get("limit"));
    const effectiveLimit = effectiveOhlcvLimit(requestedLimit);
    const [statusResult, quoteResult, ohlcvResult] = await Promise.all([
      runCli(["status"]),
      runCli(["quote"]),
      runCli(["ohlcv", "--count", String(effectiveLimit)])
    ]);
    const quote = buildQuotePayload({ symbol, timeframe, statusResult, quoteResult });
    const candles = buildCandlesPayload({ symbol, timeframe, requestedLimit, effectiveLimit, statusResult, ohlcvResult });
    const ohlcvSummary = candleSummary(candles.candles);
    const evidence = buildEvidence({
      symbol,
      timeframe,
      statusResult,
      quoteResult,
      ohlcvResult: {
        ...ohlcvResult,
        payload: {
          ...ohlcvResult.payload,
          ...ohlcvSummary
        }
      }
    });
    const marketSnapshot = buildMarketSnapshotPayload({ symbol, timeframe, quote, candles, evidence, statusResult });
    json(res, 200, {
      status: statusResult.ok ? "connected_analysis_only" : "disconnected",
      quote,
      candles,
      evidence,
      marketSnapshot,
      mode: "read_only_chart_data",
      ...authority
    });
    return;
  }

  json(res, 404, {
    status: "not_found",
    message: "Supported routes: GET /health, GET /status, GET /, POST /evidence, GET /evidence?symbol=...&timeframe=..., GET /quote, GET /candles, GET /snapshot",
    ...authority
  });
});

server.on("error", async (error) => {
  if (error?.code !== "EADDRINUSE") {
    console.error(`TradingView MCP wrapper failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const diagnosis = await diagnoseBridgePort({ host, port, includeCandles: false });
  if (diagnosis.status === "healthy_gotrader_wrapper") {
    console.log(`TradingView MCP wrapper already running at ${diagnosis.url}`);
    console.log("Use npm.cmd run test:tradingview-mcp or connect from Command Center.");
    process.exit(0);
  }

  const listener = diagnosis.listeners[0];
  console.error(
    `Port ${port} is occupied${listener?.pid ? ` by PID ${listener.pid}` : ""}, but it is not responding as the GoTrader wrapper.`
  );
  if (listener?.process) {
    console.error(compactProcess(listener.process));
  }
  console.error("Next steps:");
  console.error("  npm.cmd run tradingview:mcp-diagnose-port");
  console.error("  npm.cmd run tradingview:mcp-stop");
  console.error(diagnosis.nextRecommendedAction);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`GoTrader TradingView MCP read-only wrapper listening at http://${host}:${port}`);
  if (!repoDir) {
    console.log("Set TRADINGVIEW_MCP_REPO_DIR to a local tradingview-mcp clone to enable upstream CLI calls.");
  }
});
