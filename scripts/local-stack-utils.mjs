import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { getListenerProcesses } from "./tradingview-bridge-port-utils.mjs";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "..");
export const stackDir = path.join(repoRoot, ".gotrader");
export const stackStatePath = path.join(stackDir, "local-stack.json");
export const stackLogDir = path.join(stackDir, "local-stack-logs");
export const stackHost = "127.0.0.1";
export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
export const pythonCommand = process.env.PYTHON || "python";
export const mt5UpstreamDir = process.env.MT5_MCP_SERVER_DIR || "C:/Users/andre/metatrader-mcp-server";

export const serviceDefinitions = [
  {
    id: "app",
    label: "GoTrader app/Vite",
    port: 5173,
    required: true,
    defaultEnabled: true,
    healthUrls: [`http://${stackHost}:5173/`]
  },
  {
    id: "mt5-upstream",
    label: "MT5 upstream Python server",
    port: 8000,
    required: false,
    defaultEnabled: "env",
    healthUrls: [`http://${stackHost}:8000/health`, `http://${stackHost}:8000/api/v1/market/symbols`, `http://${stackHost}:8000/`]
  },
  {
    id: "mt5-wrapper",
    label: "GoTrader MT5 read-only wrapper",
    port: 7341,
    required: true,
    defaultEnabled: true,
    healthUrls: [`http://${stackHost}:7341/health`]
  },
  {
    id: "llm-bridge",
    label: "LLM advisory bridge",
    port: 8787,
    required: true,
    defaultEnabled: true,
    healthUrls: [`http://${stackHost}:8787/health`, `http://${stackHost}:8787/`]
  },
  {
    id: "tradingview-mcp",
    label: "TradingView MCP bridge",
    port: 7331,
    required: false,
    defaultEnabled: false,
    healthUrls: [`http://${stackHost}:7331/health`]
  }
];

export const serviceById = new Map(serviceDefinitions.map((service) => [service.id, service]));

export const redacted = "[redacted]";

export function isTruthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

export function mt5UpstreamEnvStatus(env = process.env) {
  const required = ["LOGIN", "PASSWORD", "SERVER", "MT5_PATH"];
  const missing = required.filter((key) => !env[key]);
  return {
    ready: missing.length === 0,
    missing,
    present: Object.fromEntries(required.map((key) => [key, Boolean(env[key])]))
  };
}

export async function ensureStackDirs() {
  await fs.mkdir(stackDir, { recursive: true });
  await fs.mkdir(stackLogDir, { recursive: true });
}

export async function loadStackState() {
  try {
    const raw = await fs.readFile(stackStatePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      services: [],
      ...parsed,
      services: Array.isArray(parsed.services) ? parsed.services : []
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      services: []
    };
  }
}

export async function saveStackState(state) {
  await ensureStackDirs();
  const safeState = {
    version: 1,
    ...state,
    updatedAt: new Date().toISOString(),
    services: Array.isArray(state.services) ? state.services : []
  };
  await fs.writeFile(stackStatePath, `${JSON.stringify(safeState, null, 2)}\n`, "utf8");
  return safeState;
}

export function isPidAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) {
    return false;
  }
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

export async function isPortOpen(port, host = stackHost, timeoutMs = 700) {
  return new Promise((resolve) => {
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
}

export async function probeJson(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      url,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeFirst(urls, timeoutMs = 1500) {
  const attempts = [];
  for (const url of urls) {
    const result = await probeJson(url, timeoutMs);
    attempts.push(result);
    if (result.ok) {
      return {
        ok: true,
        result,
        attempts
      };
    }
  }
  return {
    ok: false,
    result: attempts[0],
    attempts
  };
}

export async function getPortSummary(port) {
  const open = await isPortOpen(port);
  const listeners = open ? await getListenerProcesses(port) : [];
  return {
    port,
    open,
    listeners: listeners.map((listener) => ({
      pid: listener.pid,
      localAddress: listener.localAddress,
      process: listener.process
        ? {
            pid: listener.process.pid,
            name: listener.process.name,
            executablePath: listener.process.executablePath
          }
        : undefined
    }))
  };
}

export async function diagnoseService(service, state) {
  const resolvedState = state ?? await loadStackState();
  const tracked = resolvedState.services.find((item) => item.id === service.id);
  const port = await getPortSummary(service.port);
  const health = await probeFirst(service.healthUrls);
  const trackedAlive = tracked ? isPidAlive(tracked.pid) : false;
  const status = health.ok
    ? "healthy"
    : trackedAlive
      ? "tracked_process_running_health_failed"
      : port.open
        ? "port_open_health_failed"
        : "stopped";
  return {
    id: service.id,
    label: service.label,
    port: service.port,
    required: service.required,
    tracked: tracked
      ? {
          pid: tracked.pid,
          startedAt: tracked.startedAt,
          command: tracked.command,
          logFile: tracked.logFile,
          alive: trackedAlive
        }
      : undefined,
    port,
    health: {
      ok: health.ok,
      url: health.result?.url,
      status: health.result?.status,
      error: health.result?.error,
      payloadSummary: summarizePayload(health.result?.payload)
    },
    status
  };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? payload.slice(0, 180) : payload;
  }
  return {
    provider: payload.provider,
    status: payload.status,
    service: payload.service,
    connectionStatus: payload.connectionStatus,
    wrapperStatus: payload.wrapperStatus,
    executionAuthority: payload.executionAuthority,
    brokerAuthority: payload.brokerAuthority,
    readinessOverrideAuthority: payload.readinessOverrideAuthority
  };
}

export async function startProcess({
  id,
  label,
  command,
  args,
  cwd = repoRoot,
  env = process.env,
  commandLabel,
  waitMs = 0
}) {
  await ensureStackDirs();
  const logFile = path.join(stackLogDir, `${id}.log`);
  const logHandle = await fs.open(logFile, "a");
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    windowsHide: true
  });
  child.unref();
  await logHandle.close();
  if (waitMs) {
    await sleep(waitMs);
  }
  return {
    id,
    label,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    cwd,
    command: commandLabel ?? `${command} ${args.join(" ")}`,
    logFile
  };
}

export async function stopTrackedProcess(service) {
  if (!service?.pid || !isPidAlive(service.pid)) {
    return {
      id: service?.id,
      pid: service?.pid,
      stopped: false,
      reason: "not_running"
    };
  }
  if (process.platform === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(service.pid), "/T", "/F"], {
      windowsHide: true,
      timeout: 10_000
    });
  } else {
    try {
      process.kill(-Number(service.pid), "SIGTERM");
    } catch {
      process.kill(Number(service.pid), "SIGTERM");
    }
  }
  return {
    id: service.id,
    pid: service.pid,
    stopped: true
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function compactDiagnostic(diagnostic) {
  return {
    id: diagnostic.id,
    status: diagnostic.status,
    port: diagnostic.port.port,
    portOpen: diagnostic.port.open,
    trackedPid: diagnostic.tracked?.pid,
    trackedAlive: diagnostic.tracked?.alive,
    healthOk: diagnostic.health.ok,
    healthStatus: diagnostic.health.status,
    healthUrl: diagnostic.health.url,
    healthError: diagnostic.health.error
  };
}
