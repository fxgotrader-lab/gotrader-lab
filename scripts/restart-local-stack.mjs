#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { repoRoot } from "./local-stack-utils.mjs";

const runScript = (scriptPath) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: false
    });
    child.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`${path.basename(scriptPath)} exited with code ${code}.`));
        return;
      }
      resolve();
    });
    child.on("error", reject);
  });

console.log("Stopping tracked GoTrader local stack processes...");
await runScript("scripts/stop-local-stack.mjs");

console.log("Starting GoTrader local stack...");
await runScript("scripts/start-local-stack.mjs");
