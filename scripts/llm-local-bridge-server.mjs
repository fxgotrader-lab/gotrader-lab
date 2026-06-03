#!/usr/bin/env node

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_ADVISORY_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 2_000;
const PROVIDER_SCRIPT = path.join("scripts", "gpt55-llm-agent-provider.mjs");
const LATEST_RESPONSE_FILE = path.join("llm", "responses", "latest-llm-response.json");
const allowedOrigins = new Set(
  Array.from({ length: 7 }, (_, index) => 5173 + index).flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
  ])
);

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 2_000 ? Math.round(value) : fallback;
}

const advisoryTimeoutMs = () => positiveIntegerEnv("LLM_ADVISORY_TIMEOUT_MS", DEFAULT_ADVISORY_TIMEOUT_MS);
const advisoryModel = () => process.env.LLM_ADVISORY_MODEL || process.env.GOTRADER_LLM_MODEL || DEFAULT_MODEL;

function healthPayload() {
  const advisoryProviderConfigured = Boolean(process.env.OPENAI_API_KEY);
  const model = advisoryModel();
  const modelConfigured = Boolean(model);
  const advisoryEndpointAvailable = true;
  const advisoryCapabilityStatus =
    advisoryProviderConfigured && modelConfigured && advisoryEndpointAvailable ? "ready" : "config_missing";
  return {
    status: "ok",
    service: "gotrader_llm_bridge",
    mode: "advisory_only",
    bridgeProcessStatus: "online",
    advisoryCapabilityStatus,
    advisoryEndpointAvailable,
    advisoryProviderConfigured,
    advisoryTimeoutMs: advisoryTimeoutMs(),
    healthTimeoutMs: HEALTH_TIMEOUT_MS,
    modelConfigured,
    model,
    statusMessage:
      advisoryCapabilityStatus === "ready"
        ? "LLM advisory bridge is online and the advisory provider is configured."
        : "LLM advisory bridge is online, but OPENAI_API_KEY is not configured for POST /llm/run-advisory.",
    healthCheckedAt: new Date().toISOString(),
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
}

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  return {
    help: argv.includes("--help") || argv.includes("-h"),
    port: Number(valueAfter("--port") ?? DEFAULT_PORT)
  };
}

function printHelp() {
  process.stdout.write(`GoTrader AI Lab local LLM bridge server

Runs a localhost-only bridge that accepts advisory context JSON from the Vite app,
delegates to scripts/gpt55-llm-agent-provider.mjs, and returns validated advisory JSON.

Usage:
  node scripts/llm-local-bridge-server.mjs
  node scripts/llm-local-bridge-server.mjs --port 8787
  node scripts/llm-local-bridge-server.mjs --help

Environment:
  OPENAI_API_KEY       Required for POST /llm/run-advisory.
  LLM_ADVISORY_MODEL   Optional. Overrides the advisory model for this bridge.
  GOTRADER_LLM_MODEL   Optional fallback model. Defaults inside the provider to gpt-5.5.
  LLM_ADVISORY_TIMEOUT_MS Optional. Defaults to ${DEFAULT_ADVISORY_TIMEOUT_MS}.

Endpoint:
  GET  http://127.0.0.1:8787/
  GET  http://127.0.0.1:8787/health
  POST http://127.0.0.1:8787/llm/run-advisory

Safety:
  Localhost only. Advisory only. No broker control. No execution authority. No readiness override.
`);
}

function sanitizeError(value) {
  return String(value ?? "Unknown error")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9._\-]{16,}\b/g, "sk-[redacted]");
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeBridgeError(payload) {
  const errorPath = path.join("llm", "errors", `llm-local-bridge-error-${Date.now()}.json`);
  await writeJsonFile(errorPath, {
    errorId: `llm_bridge_error_${Date.now()}`,
    timestamp: new Date().toISOString(),
    bridge: "llm_local_bridge_server",
    mode: "advisory_only",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    ...payload,
    message: sanitizeError(payload.message),
    safetyNotice: "Local LLM bridge error. No broker control. No execution authority. No readiness override."
  });
  return errorPath;
}

function validateRequestContext(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    errors.push("request body must be a JSON object");
  } else {
    if (packet.source !== "gotrader_ai_lab") {
      errors.push('source must be "gotrader_ai_lab"');
    }
    if (packet.mode !== "advisory_only") {
      errors.push('mode must be "advisory_only"');
    }
    if (packet.executionAuthority !== "none") {
      errors.push('executionAuthority must be "none"');
    }
    if (packet.brokerAuthority !== "none") {
      errors.push('brokerAuthority must be "none"');
    }
    if (packet.readinessOverrideAuthority !== "none") {
      errors.push('readinessOverrideAuthority must be "none"');
    }
    if (!packet.packetId) {
      errors.push("packetId is required");
    }
    if (!Array.isArray(packet.safetyConstraints)) {
      errors.push("safetyConstraints must be present");
    }
  }

  if (errors.length > 0) {
    const error = new Error(`context validation failed: ${errors.join("; ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, statusCode, payload, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  response.writeHead(statusCode, headers);
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("error", reject);
    request.on("end", () => resolve(raw));
  });
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error(`${label} is not valid JSON`);
    error.statusCode = 400;
    throw error;
  }
}

function runProviderWithContext(packet) {
  return new Promise((resolve, reject) => {
    const timeoutMs = advisoryTimeoutMs();
    const child = spawn(
      process.execPath,
      [PROVIDER_SCRIPT, "--output-file", LATEST_RESPONSE_FILE],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      const error = new Error(`LLM advisory provider timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      error.statusCode = 504;
      error.code = "LLM_ADVISORY_TIMEOUT";
      reject(error);
    }, timeoutMs);

    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", async (code) => {
      settle(async () => {
        if (code !== 0) {
          const error = new Error(sanitizeError(stderr || stdout || `provider exited with code ${code}`));
          error.statusCode = 502;
          reject(error);
          return;
        }

        try {
          const responseJson = await fs.readFile(LATEST_RESPONSE_FILE, "utf8");
          resolve(parseJson(responseJson, "provider response"));
        } catch (error) {
          error.statusCode = 502;
          reject(error);
        }
      });
    });

    child.stdin.end(JSON.stringify(packet));
  });
}

async function handleRunAdvisory(request, response, origin) {
  if (!process.env.OPENAI_API_KEY) {
    const errorPath = await writeBridgeError({
      statusCode: 503,
      message: "OPENAI_API_KEY is required in the local bridge environment. Set it in PowerShell; do not commit it."
    });
    sendJson(
      response,
      503,
      {
        error: "Local LLM bridge is missing OPENAI_API_KEY.",
        errorPath,
        bridgeProcessStatus: "online",
        advisoryCapabilityStatus: "config_missing",
        advisoryEndpointAvailable: true,
        advisoryProviderConfigured: false,
        advisoryTimeoutMs: advisoryTimeoutMs(),
        healthTimeoutMs: HEALTH_TIMEOUT_MS,
        modelConfigured: true,
        mode: "advisory_only",
        executionAuthority: "none",
        brokerAuthority: "none",
        readinessOverrideAuthority: "none"
      },
      origin
    );
    return;
  }

  const raw = await readRequestBody(request);
  const packet = parseJson(raw, "request body");
  validateRequestContext(packet);
  const responses = await runProviderWithContext(packet);

  sendJson(
    response,
    200,
    {
      responses,
      responseFile: LATEST_RESPONSE_FILE,
      advisoryResponseMode: packet.advisoryResponseMode ?? "full_reviewer_set",
      payloadDiagnostics: packet.payloadDiagnostics,
      model: advisoryModel(),
      advisoryTimeoutMs: advisoryTimeoutMs(),
      mode: "advisory_only",
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    },
    origin
  );
}

async function handleRequest(request, response) {
  const origin = request.headers.origin ?? "";
  const host = request.headers.host ?? "";
  const remoteAddress = request.socket.remoteAddress ?? "";
  const localRequest =
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1";

  if (!localRequest || !(host.startsWith("127.0.0.1:") || host.startsWith("localhost:"))) {
    sendJson(response, 403, { error: "Remote requests are not accepted by the local LLM bridge." }, origin);
    return;
  }

  if (origin && !allowedOrigins.has(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed for the local LLM bridge." }, origin);
    return;
  }

  if (request.method === "OPTIONS") {
    if (!allowedOrigins.has(origin)) {
      sendJson(response, 403, { error: "Origin is not allowed for the local LLM bridge." }, origin);
      return;
    }
    response.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin"
    });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, healthPayload(), origin);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/") {
    sendJson(
      response,
      200,
      {
        status: "ok",
        message: "GoTrader AI Lab local LLM bridge is running. Use POST /llm/run-advisory.",
        health: "/health",
        ...healthPayload()
      },
      origin
    );
    return;
  }

  if (request.method !== "POST" || request.url !== "/llm/run-advisory") {
    sendJson(
      response,
      404,
      {
        error: "Not found",
        message: "Opening / in browser is not the advisory endpoint. Use /health to verify bridge status, or POST /llm/run-advisory from GoTrader AI Lab."
      },
      origin
    );
    return;
  }

  try {
    await handleRunAdvisory(request, response, origin);
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    const errorPath = await writeBridgeError({
      statusCode,
      message: error.message ?? error
    }).catch(() => undefined);
    sendJson(
      response,
      statusCode,
      {
        error: sanitizeError(error.message ?? error),
        errorPath,
        bridgeProcessStatus: "online",
        advisoryCapabilityStatus: statusCode === 504 || error.code === "LLM_ADVISORY_TIMEOUT" ? "timeout" : "error",
        advisoryEndpointAvailable: true,
        advisoryProviderConfigured: Boolean(process.env.OPENAI_API_KEY),
        advisoryTimeoutMs: advisoryTimeoutMs(),
        healthTimeoutMs: HEALTH_TIMEOUT_MS,
        mode: "advisory_only",
        executionAuthority: "none",
        brokerAuthority: "none",
        readinessOverrideAuthority: "none"
      },
      origin
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    process.stderr.write("Invalid --port value.\n");
    process.exitCode = 1;
    return;
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: sanitizeError(error.message ?? error) }, request.headers.origin ?? "");
    });
  });

  server.listen(args.port, DEFAULT_HOST, () => {
    process.stderr.write(
      `GoTrader AI Lab local LLM bridge listening on http://${DEFAULT_HOST}:${args.port}\n` +
        "Advisory only. No broker control. No execution authority. No readiness override.\n"
    );
  });
}

main();
