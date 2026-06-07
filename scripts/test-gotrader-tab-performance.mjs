#!/usr/bin/env node

import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { chromium, expect } from "@playwright/test";

const host = "127.0.0.1";
const requestedPort = Number(process.env.PLAYWRIGHT_PORT ?? 4187);
const baseUrlFromEnv = process.env.PLAYWRIGHT_BASE_URL;
const unsafeExecutionControls = [
  "Place Order",
  "Buy Market",
  "Sell Market",
  "Enable Live Trading",
  "Connect Live Broker"
];
const heavyAutoRunPatterns = [
  /Running browser-safe replay/i,
  /Running Monte Carlo robustness/i,
  /Running browser-safe replay scorecard/i,
  /Running profile optimization/i,
  /Running MT5 depth/i,
  /performance audit running/i,
  /90-day session narrative running/i
];
const rawSensitivePatterns = [
  /"candles"\s*:/i,
  /accountNumber/i,
  /orderId/i,
  /positionId/i,
  /password/i,
  /OPENAI_API_KEY/i,
  /MT5_PASSWORD/i
];

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
    if (await isPortFree(port)) return port;
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
      if (status >= 200 && status < 500) return;
      lastError = new Error(`HTTP ${status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  throw new Error(`Static server did not become ready: ${lastError?.message ?? "unknown error"}`);
}

async function measureRoute(page, baseUrl, route, label) {
  const startedAt = performance.now();
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(450);
  await expect(page.locator("main")).toBeVisible();
  const loadMs = Math.round(performance.now() - startedAt);
  const bodyText = await page.locator("main").innerText();
  const renderedCharacters = bodyText.length;
  const forbiddenHeavyText = heavyAutoRunPatterns.filter((pattern) => pattern.test(bodyText)).map(String);
  const forbiddenRawText = rawSensitivePatterns.filter((pattern) => pattern.test(bodyText)).map(String);

  for (const labelText of unsafeExecutionControls) {
    await expect(page.getByRole("button", { name: labelText }).or(page.getByRole("link", { name: labelText }))).toHaveCount(0);
  }
  if (forbiddenHeavyText.length) {
    throw new Error(`${label} auto-ran heavy diagnostics: ${forbiddenHeavyText.join(", ")}`);
  }
  if (forbiddenRawText.length) {
    throw new Error(`${label} rendered raw/sensitive fields: ${forbiddenRawText.join(", ")}`);
  }

  return { label, route, loadMs, renderedCharacters };
}

async function assertAdvisorHeavyPanelsDeferred(page, baseUrl) {
  await page.goto(`${baseUrl}/advisor`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await expect(page.getByTestId("advisor-manual-replay-section")).toContainText(/deferred/i);
  await expect(page.getByTestId("advisor-market-scorecard-section")).toContainText(/deferred/i);
  await expect(page.getByTestId("advisor-profile-optimizer-section")).toContainText(/deferred/i);
  await expect(page.getByTestId("advisor-saved-reports-section")).toContainText(/deferred/i);
  await expect(page.getByTestId("ict-manual-replay-review")).toHaveCount(0);
  await expect(page.getByTestId("ict-monte-carlo-robustness")).toHaveCount(0);
  await expect(page.getByTestId("ict-market-scorecard")).toHaveCount(0);
  await expect(page.getByTestId("ict-approved-profile-optimizer")).toHaveCount(0);
  await expect(page.getByTestId("ict-saved-research-reports")).toHaveCount(0);
}

async function assertDashboardAdvancedDeferred(page, baseUrl) {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const mainText = await page.locator("main").innerText();
  if (/Timing \/ Expansion Replay|Grinch Profile Diagnostics|Chart Stability Diagnostics/i.test(mainText)) {
    throw new Error("Dashboard advanced diagnostics mounted before Advanced Details was opened.");
  }
  await expect(page.locator("main")).toContainText(/Advanced diagnostics are deferred until opened/i);
}

const port = baseUrlFromEnv ? undefined : await findFreePort(requestedPort);
const baseUrl = baseUrlFromEnv ?? `http://${host}:${port}`;
let server;
let browser;

try {
  if (!baseUrlFromEnv) {
    server = spawn(process.execPath, ["scripts/playwright-static-server.mjs"], {
      env: { ...process.env, PLAYWRIGHT_PORT: String(port) },
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true
    });
    await waitForServer(baseUrl);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const results = [];
  results.push(await measureRoute(page, baseUrl, "/dashboard", "Command Center"));
  results.push(await measureRoute(page, baseUrl, "/autonomous-research", "Autonomous Workflow"));
  results.push(await measureRoute(page, baseUrl, "/advisor", "Advanced/Advisor"));
  results.push(await measureRoute(page, baseUrl, "/agent-debate", "Diagnostics"));
  await assertAdvisorHeavyPanelsDeferred(page, baseUrl);
  await assertDashboardAdvancedDeferred(page, baseUrl);

  console.log(JSON.stringify({
    status: "passed",
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    },
    measurements: results,
    checks: {
      advancedTabDoesNotAutoRunReplay: true,
      advancedTabDoesNotAutoRunScorecard: true,
      advancedTabDoesNotAutoRunMonteCarlo: true,
      advancedTabDoesNotAutoRunDepth: true,
      diagnosticsTabDoesNotAutoRunReplayDiagnostics: true,
      diagnosticsTabDoesNotAutoRunPerformanceAudit: true,
      inactiveHeavyAdvisorPanelsNotMounted: true,
      rawCandlesExcludedFromRenderedOutput: true,
      accountOrderPositionSecretsExcluded: true
    }
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill();
}
