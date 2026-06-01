import {
  compactProcess,
  defaultBridgeHost,
  defaultBridgePort,
  diagnoseBridgePort,
  isSafeGoTraderWrapperProcess
} from "./tradingview-bridge-port-utils.mjs";

const host = process.env.TRADINGVIEW_MCP_BRIDGE_HOST || defaultBridgeHost;
const port = Number(process.env.TRADINGVIEW_MCP_BRIDGE_PORT || defaultBridgePort);

const diagnosis = await diagnoseBridgePort({ host, port, includeCandles: true, timeoutMs: 2600 });

console.log(`TradingView MCP bridge port diagnostic: ${diagnosis.url}`);
console.log(`Status: ${diagnosis.status}`);

if (!diagnosis.listeners.length) {
  console.log("Port listener: none");
} else {
  console.log("Port listeners:");
  for (const listener of diagnosis.listeners) {
    console.log(`- ${listener.localAddress} ${listener.state} ${compactProcess(listener.process)}`);
    console.log(`  Safe GoTrader wrapper match: ${isSafeGoTraderWrapperProcess(listener.process) ? "yes" : "no"}`);
  }
}

const summarizeProbe = (label, probe) => {
  const payload = probe?.payload && typeof probe.payload === "object" ? probe.payload : undefined;
  console.log(`${label}: ${probe?.ok ? "ok" : "failed"} (${probe?.status ?? "no response"})`);
  if (payload?.status || payload?.connectionStatus) {
    console.log(`  reported status: ${payload.status ?? payload.connectionStatus}`);
  }
  if (payload?.message) {
    console.log(`  message: ${payload.message}`);
  }
  if (probe?.error) {
    console.log(`  error: ${probe.error}`);
  }
};

summarizeProbe("GET /health", diagnosis.probes.health);
summarizeProbe("GET /status", diagnosis.probes.status);
summarizeProbe("GET /candles", diagnosis.probes.candles);

console.log(`Next action: ${diagnosis.nextRecommendedAction}`);
console.log(
  JSON.stringify(
    {
      status: diagnosis.status,
      url: diagnosis.url,
      listeners: diagnosis.listeners.map((listener) => ({
        localAddress: listener.localAddress,
        pid: listener.pid,
        processName: listener.process?.name,
        executablePath: listener.process?.executablePath,
        safeGoTraderWrapperMatch: isSafeGoTraderWrapperProcess(listener.process)
      })),
      healthOk: diagnosis.probes.health.ok,
      statusOk: diagnosis.probes.status.ok,
      candlesOk: diagnosis.probes.candles?.ok,
      nextRecommendedAction: diagnosis.nextRecommendedAction
    },
    null,
    2
  )
);

process.exitCode = 0;
