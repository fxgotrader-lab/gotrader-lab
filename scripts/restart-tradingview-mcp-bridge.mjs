import { spawn } from "node:child_process";
import {
  compactProcess,
  defaultBridgeHost,
  defaultBridgePort,
  diagnoseBridgePort,
  isSafeGoTraderWrapperProcess
} from "./tradingview-bridge-port-utils.mjs";

const host = process.env.TRADINGVIEW_MCP_BRIDGE_HOST || defaultBridgeHost;
const port = Number(process.env.TRADINGVIEW_MCP_BRIDGE_PORT || defaultBridgePort);

const before = await diagnoseBridgePort({ host, port, includeCandles: false });

if (before.listeners.length) {
  for (const listener of before.listeners) {
    if (!isSafeGoTraderWrapperProcess(listener.process)) {
      console.error(`Refusing to stop unknown process on ${listener.localAddress}: ${compactProcess(listener.process)}`);
      console.error("Run npm.cmd run tradingview:mcp-diagnose-port, or set a different TRADINGVIEW_MCP_BRIDGE_PORT.");
      process.exit(1);
    }
    console.log(`Stopping stale GoTrader TradingView MCP wrapper: ${compactProcess(listener.process)}`);
    process.kill(listener.pid);
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const afterStop = await diagnoseBridgePort({ host, port, includeCandles: false });
if (afterStop.listeners.length) {
  console.error(`Port ${port} is still occupied; restart aborted.`);
  console.error(afterStop.nextRecommendedAction);
  process.exit(1);
}

console.log(`Starting GoTrader TradingView MCP wrapper at http://${host}:${port}`);
if (process.env.TRADINGVIEW_MCP_REPO_DIR) {
  console.log(`Using TRADINGVIEW_MCP_REPO_DIR=${process.env.TRADINGVIEW_MCP_REPO_DIR}`);
}

const child = spawn(process.execPath, ["scripts/start-tradingview-mcp-bridge.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: false
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
