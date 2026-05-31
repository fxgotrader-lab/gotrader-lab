#!/usr/bin/env node

import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const host = "127.0.0.1";
const requestedPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findFreePort(startAt) {
  for (let port = startAt; port < startAt + 80; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free localhost port found from ${startAt} to ${startAt + 79}.`);
}

function request(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("timeout", () => req.destroy(new Error(`Timed out while requesting ${url}`)));
    req.on("error", reject);
  });
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 30_000) {
    try {
      const status = await request(baseUrl);
      if (status >= 200 && status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(400);
  }
  throw new Error(`Playwright static server did not become ready: ${lastError?.message ?? "unknown error"}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
      ...options
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const port = process.env.PLAYWRIGHT_BASE_URL ? undefined : await findFreePort(requestedPort);
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
let server;

try {
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    server = spawn(process.execPath, ["scripts/playwright-static-server.mjs"], {
      env: { ...process.env, PLAYWRIGHT_PORT: String(port) },
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true
    });
    await waitForServer(baseUrl);
  }

  const code = await run(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "tests/smoke/routes.spec.ts"],
    {
      env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl }
    }
  );
  process.exitCode = code;
} finally {
  if (server && !server.killed) {
    server.kill();
  }
}
