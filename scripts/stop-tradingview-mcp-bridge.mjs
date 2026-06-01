import {
  compactProcess,
  defaultBridgeHost,
  defaultBridgePort,
  diagnoseBridgePort,
  isSafeGoTraderWrapperProcess
} from "./tradingview-bridge-port-utils.mjs";

const host = process.env.TRADINGVIEW_MCP_BRIDGE_HOST || defaultBridgeHost;
const port = Number(process.env.TRADINGVIEW_MCP_BRIDGE_PORT || defaultBridgePort);
const forceStop = String(process.env.FORCE_STOP_TRADINGVIEW_MCP_BRIDGE || "").toLowerCase() === "true";

const before = await diagnoseBridgePort({ host, port, includeCandles: false });

if (!before.listeners.length) {
  console.log(`TradingView MCP bridge port ${port} is already free.`);
  process.exit(0);
}

let stopped = 0;
let blocked = 0;

for (const listener of before.listeners) {
  const safe = isSafeGoTraderWrapperProcess(listener.process);
  const processSummary = compactProcess(listener.process);
  if (!safe && !forceStop) {
    blocked += 1;
    console.log(`Not stopping unknown listener on ${listener.localAddress}: ${processSummary}`);
    console.log('Set $env:FORCE_STOP_TRADINGVIEW_MCP_BRIDGE="true" to force stop this listener.');
    continue;
  }
  try {
    process.kill(listener.pid);
    stopped += 1;
    console.log(`Stopped TradingView MCP bridge listener: ${processSummary}`);
  } catch (error) {
    blocked += 1;
    console.log(`Unable to stop ${processSummary}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await new Promise((resolve) => setTimeout(resolve, 1200));
const after = await diagnoseBridgePort({ host, port, includeCandles: false });

console.log(`Port ${port} after stop: ${after.status}`);
console.log(`Next action: ${after.nextRecommendedAction}`);

process.exitCode = blocked > 0 || (stopped > 0 && after.listeners.length > 0) ? 1 : 0;
