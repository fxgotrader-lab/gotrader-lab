import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const host = process.env.TRADINGVIEW_MCP_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.TRADINGVIEW_MCP_BRIDGE_PORT || 7331);
const repoDir = process.env.TRADINGVIEW_MCP_REPO_DIR ? resolve(process.env.TRADINGVIEW_MCP_REPO_DIR) : "";
const cliPath = process.env.TRADINGVIEW_MCP_CLI
  ? resolve(process.env.TRADINGVIEW_MCP_CLI)
  : repoDir
    ? join(repoDir, "src", "cli", "index.js")
    : "";
const nodeBin = process.env.TRADINGVIEW_MCP_NODE || process.execPath;
const cliTimeoutMs = Number(process.env.TRADINGVIEW_MCP_CLI_TIMEOUT_MS || 4000);

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

  json(res, 404, {
    status: "not_found",
    message: "Supported routes: GET /health, GET /status, GET /, POST /evidence, GET /evidence?symbol=...&timeframe=...",
    ...authority
  });
});

server.listen(port, host, () => {
  console.log(`GoTrader TradingView MCP read-only wrapper listening at http://${host}:${port}`);
  if (!repoDir) {
    console.log("Set TRADINGVIEW_MCP_REPO_DIR to a local tradingview-mcp clone to enable upstream CLI calls.");
  }
});
