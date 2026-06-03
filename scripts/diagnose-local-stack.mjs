#!/usr/bin/env node

import {
  compactDiagnostic,
  diagnoseService,
  isTruthyEnv,
  loadStackState,
  mt5UpstreamDir,
  mt5UpstreamEnvStatus,
  serviceDefinitions,
  stackStatePath
} from "./local-stack-utils.mjs";

const state = await loadStackState();
const envStatus = mt5UpstreamEnvStatus();
const tradingViewEnabled = isTruthyEnv(process.env.ENABLE_TRADINGVIEW_MCP);
const diagnostics = [];

for (const service of serviceDefinitions) {
  diagnostics.push(await diagnoseService(service, state));
}

const requiredFailures = diagnostics.filter((diagnostic) => {
  const service = serviceDefinitions.find((item) => item.id === diagnostic.id);
  return service?.required && diagnostic.status !== "healthy";
});

const optionalNotes = [
  !envStatus.ready
    ? `MT5 upstream env incomplete: ${envStatus.missing.join(", ")} missing. Upstream service is optional for stack startup.`
    : undefined,
  !tradingViewEnabled
    ? "TradingView MCP is optional and disabled by default. Set ENABLE_TRADINGVIEW_MCP=true to include it."
    : undefined
].filter(Boolean);

const summary = {
  status: requiredFailures.length ? "degraded" : "healthy_or_optional_only",
  stateFile: stackStatePath,
  trackedServices: state.services.map((service) => ({
    id: service.id,
    pid: service.pid,
    startedAt: service.startedAt,
    command: service.command,
    logFile: service.logFile
  })),
  env: {
    mt5UpstreamDir,
    mt5RequiredVariablesPresent: envStatus.present,
    mt5MissingVariables: envStatus.missing,
    enableTradingViewMcp: tradingViewEnabled
  },
  services: diagnostics.map(compactDiagnostic),
  optionalNotes,
  nextRecommendedAction: requiredFailures.length
    ? "Run npm.cmd run start:local-stack, then rerun npm.cmd run diagnose:local-stack. If ports are occupied by untracked processes, inspect them before stopping anything."
    : "Core local stack checks are healthy or only optional services are offline."
};

console.log("GoTrader local stack diagnostic");
for (const service of diagnostics) {
  const compact = compactDiagnostic(service);
  console.log(
    [
      `${service.label}: ${compact.status}`,
      `port ${compact.port} ${compact.portOpen ? "open" : "closed"}`,
      compact.trackedPid ? `tracked PID ${compact.trackedPid} (${compact.trackedAlive ? "alive" : "stopped"})` : "untracked",
      compact.healthOk ? "health ok" : `health failed${compact.healthError ? `: ${compact.healthError}` : ""}`
    ].join(" | ")
  );
}
for (const note of optionalNotes) {
  console.log(`Note: ${note}`);
}
console.log(JSON.stringify(summary, null, 2));

process.exitCode = 0;
