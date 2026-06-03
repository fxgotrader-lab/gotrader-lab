#!/usr/bin/env node

import {
  diagnoseService,
  isPidAlive,
  loadStackState,
  saveStackState,
  serviceDefinitions,
  stopTrackedProcess
} from "./local-stack-utils.mjs";

const state = await loadStackState();
const tracked = state.services.filter((service) => service?.pid);
const results = [];

if (!tracked.length) {
  console.log("No tracked GoTrader local stack processes found in .gotrader/local-stack.json.");
} else {
  for (const service of tracked) {
    if (!isPidAlive(service.pid)) {
      console.log(`${service.label ?? service.id} PID ${service.pid} is already stopped.`);
      results.push({ id: service.id, pid: service.pid, stopped: false, reason: "already_stopped" });
      continue;
    }
    try {
      const result = await stopTrackedProcess(service);
      results.push(result);
      console.log(`Stopped ${service.label ?? service.id} PID ${service.pid}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id: service.id, pid: service.pid, stopped: false, reason: message });
      console.warn(`Failed to stop ${service.label ?? service.id} PID ${service.pid}: ${message}`);
    }
  }
}

await saveStackState({
  version: 1,
  services: [],
  lastStopAt: new Date().toISOString(),
  stopResults: results
});

const diagnostics = [];
for (const service of serviceDefinitions) {
  diagnostics.push(await diagnoseService(service));
}

console.log("Local stack stop summary:");
console.log(
  JSON.stringify(
    {
      stopped: results,
      ports: diagnostics.map((diagnostic) => ({
        id: diagnostic.id,
        port: diagnostic.port.port,
        portOpen: diagnostic.port.open,
        status: diagnostic.status,
        note: diagnostic.port.open ? "Port remains occupied by an untracked or externally started process." : "free"
      }))
    },
    null,
    2
  )
);
