#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  compactDiagnostic,
  diagnoseService,
  isPortOpen,
  isTruthyEnv,
  isPidAlive,
  loadStackState,
  mt5UpstreamDir,
  mt5UpstreamEnvStatus,
  npmCommand,
  pythonCommand,
  repoRoot,
  saveStackState,
  serviceById,
  serviceDefinitions,
  stackHost,
  startProcess,
  sleep
} from "./local-stack-utils.mjs";

const serviceOrder = ["mt5-upstream", "mt5-wrapper", "llm-bridge", "app", "tradingview-mcp"];

const envStatus = mt5UpstreamEnvStatus();
const enableTradingView = isTruthyEnv(process.env.ENABLE_TRADINGVIEW_MCP);
const upstreamUrl = process.env.MT5_READONLY_UPSTREAM_BASE_URL || `http://${stackHost}:8000`;

const isAccessible = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const shouldStartService = async (id) => {
  if (id === "tradingview-mcp") {
    return enableTradingView;
  }
  if (id === "mt5-upstream") {
    if (!envStatus.ready) {
      console.warn(`MT5 upstream not started: ${envStatus.missing.join("/")} missing.`);
      return false;
    }
    if (!(await isAccessible(mt5UpstreamDir))) {
      console.warn(`MT5 upstream not started: repo directory not found at ${mt5UpstreamDir}.`);
      return false;
    }
    if (!(await isAccessible(process.env.MT5_PATH))) {
      console.warn("MT5 upstream not started: MT5_PATH does not exist.");
      return false;
    }
    return true;
  }
  return true;
};

const startConfigFor = async (id) => {
  if (id === "app") {
    return {
      id,
      label: "GoTrader app/Vite",
      command: npmCommand,
      args: ["run", "dev"],
      cwd: repoRoot,
      commandLabel: "npm.cmd run dev",
      waitMs: 300
    };
  }
  if (id === "mt5-upstream") {
    return {
      id,
      label: "MT5 upstream Python server",
      command: pythonCommand,
      args: [
        "-m",
        "metatrader_openapi.main",
        "--login",
        process.env.LOGIN,
        "--password",
        process.env.PASSWORD,
        "--server",
        process.env.SERVER,
        "--path",
        process.env.MT5_PATH,
        "--host",
        stackHost,
        "--port",
        "8000"
      ],
      cwd: path.resolve(mt5UpstreamDir),
      commandLabel:
        `python -m metatrader_openapi.main --login ${process.env.LOGIN ? "[set]" : "[missing]"} --password [redacted] --server ${process.env.SERVER ? "[set]" : "[missing]"} --path ${process.env.MT5_PATH ? "[set]" : "[missing]"} --host ${stackHost} --port 8000`,
      waitMs: 400
    };
  }
  if (id === "mt5-wrapper") {
    const wrapperEnv = {
      ...process.env,
      MT5_READONLY_UPSTREAM_BASE_URL: upstreamUrl
    };
    return {
      id,
      label: "GoTrader MT5 read-only wrapper",
      command: npmCommand,
      args: ["run", "mt5:readonly-bridge"],
      cwd: repoRoot,
      env: wrapperEnv,
      commandLabel: "npm.cmd run mt5:readonly-bridge",
      waitMs: 300
    };
  }
  if (id === "llm-bridge") {
    return {
      id,
      label: "LLM advisory bridge",
      command: npmCommand,
      args: ["run", "llm:bridge"],
      cwd: repoRoot,
      commandLabel: "npm.cmd run llm:bridge",
      waitMs: 300
    };
  }
  if (id === "tradingview-mcp") {
    return {
      id,
      label: "TradingView MCP bridge",
      command: npmCommand,
      args: ["run", "tradingview:mcp-bridge"],
      cwd: repoRoot,
      commandLabel: "npm.cmd run tradingview:mcp-bridge",
      waitMs: 300
    };
  }
  throw new Error(`Unknown service ${id}`);
};

let state = await loadStackState();
state.services = state.services.filter((service) => isPidAlive(service.pid));
const started = [];
const skipped = [];

for (const id of serviceOrder) {
  const service = serviceById.get(id);
  if (!service) {
    continue;
  }
  if (!(await shouldStartService(id))) {
    skipped.push({ id, reason: "disabled_or_missing_env" });
    continue;
  }

  const tracked = state.services.find((item) => item.id === id);
  if (tracked && isPidAlive(tracked.pid)) {
    console.log(`${service.label} already tracked with PID ${tracked.pid}; skipping start.`);
    skipped.push({ id, reason: "tracked_process_running", pid: tracked.pid });
    continue;
  }

  if (await isPortOpen(service.port)) {
    console.warn(`${service.label} port ${service.port} is already open but not tracked by local stack; leaving it alone.`);
    skipped.push({ id, reason: "port_already_open_untracked", port: service.port });
    continue;
  }

  const config = await startConfigFor(id);
  const record = await startProcess(config);
  state.services = [...state.services.filter((item) => item.id !== id), record];
  started.push({ id, label: service.label, pid: record.pid, logFile: record.logFile });
  console.log(`Started ${service.label} with PID ${record.pid}. Log: ${record.logFile}`);
}

state = await saveStackState({
  ...state,
  started,
  skipped
});

await sleep(2500);
const diagnostics = [];
for (const service of serviceDefinitions) {
  diagnostics.push(await diagnoseService(service, state));
}

console.log("Local stack start summary:");
console.log(JSON.stringify({ started, skipped, diagnostics: diagnostics.map(compactDiagnostic) }, null, 2));
console.log(`PID file: ${path.relative(repoRoot, path.join(repoRoot, ".gotrader/local-stack.json"))}`);
console.log("TradingView MCP is optional and only starts when ENABLE_TRADINGVIEW_MCP=true.");
