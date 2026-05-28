#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const primaryRoutes = [
  "/dashboard",
  "/market-data",
  "/autonomous-research",
  "/walk-forward",
  "/self-improvement",
  "/readiness-gate",
  "/performance",
  "/communications",
  "/settings"
];

const advancedRoutes = [
  "/ict-lab",
  "/replay",
  "/backtest-lab",
  "/validation",
  "/research-quality",
  "/auto-research",
  "/agent-debate",
  "/agent-audit",
  "/llm-agents",
  "/evidence-quality",
  "/research-maturity",
  "/simulation-runbook"
];

const chartRoutes = new Set(["/dashboard", "/market-data", "/ict-lab", "/replay", "/backtest-lab"]);
const allRoutes = [...primaryRoutes, ...advancedRoutes];
const routeTimeoutMs = Number(process.env.SMOKE_ROUTE_TIMEOUT_MS ?? 15000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function findFreePort(startAt = 4173) {
  for (let port = startAt; port < startAt + 80; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free localhost port found from ${startAt} to ${startAt + 79}.`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function requestText(url, timeoutMs = routeTimeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({
          body,
          statusCode: response.statusCode ?? 0,
          url
        });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms while requesting ${url}`));
    });
    request.on("error", reject);
  });
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 25000) {
    try {
      const response = await requestText(`${baseUrl}/`, 2500);
      if (response.statusCode >= 200 && response.statusCode < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Preview server did not become ready: ${lastError?.message ?? "unknown error"}`);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function startPreviewServer() {
  if (process.env.SMOKE_BASE_URL) {
    return {
      baseUrl: normalizeBaseUrl(process.env.SMOKE_BASE_URL),
      close: async () => undefined,
      external: true
    };
  }

  if (!existsSync("dist/index.html")) {
    throw new Error("dist/index.html was not found. Run `npm run build` before `npm run smoke:routes`.");
  }

  const port = Number(process.env.SMOKE_PORT ?? (await findFreePort(4173)));
  const root = path.resolve("dist");
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const requestedPath = decodeURIComponent(url.pathname);
      const hasFileExtension = path.extname(requestedPath).length > 0;
      const relativePath = requestedPath.replace(/^\/+/, "");
      const candidatePath = path.resolve(root, relativePath);
      const filePath =
        hasFileExtension && candidatePath.startsWith(root) && existsSync(candidatePath)
          ? candidatePath
          : path.join(root, "index.html");
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypeFor(filePath)
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Smoke static server error: ${error.message}`);
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await waitForServer(baseUrl);

  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
    },
    external: false
  };
}

async function tryLoadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return undefined;
  }
}

function hasViteOverlay(text) {
  return /vite-error-overlay|Internal server error|\[plugin:vite|Transform failed/i.test(text);
}

function hasUnsafeExecutionControl(controlText) {
  return /\b(place order|submit order|buy market|sell market|enable live trading|start live trading|connect tradovate|send order|flatten position)\b/i.test(
    controlText
  );
}

async function runBrowserSmoke(baseUrl, playwright) {
  const failures = [];
  const warnings = [];
  const routeResults = [];
  let browser;

  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    warnings.push(`Playwright is installed but Chromium could not launch: ${error.message}`);
    return runHttpSmoke(baseUrl, warnings);
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });

  for (const route of allRoutes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: routeTimeoutMs });
      await page.waitForTimeout(500);
      const detail = await page.evaluate(() => {
        const bodyText = document.body.textContent ?? "";
        const visibleControls = Array.from(document.querySelectorAll("button,a,input,select,textarea"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const aria = element.getAttribute("aria-label") ?? "";
            const value = "value" in element ? String(element.value ?? "") : "";
            return `${element.textContent ?? ""} ${aria} ${value}`.replace(/\s+/g, " ").trim();
          })
          .filter(Boolean);

        return {
          bodyText,
          canvasCount: document.querySelectorAll("canvas").length,
          chartFallback: /Chart unavailable/i.test(bodyText),
          hasMain: Boolean(document.querySelector("main")),
          heading: document.querySelector("h1,h2")?.textContent?.trim() ?? "",
          path: location.pathname,
          viteOverlay: Boolean(document.querySelector("vite-error-overlay,#vite-error-overlay")),
          visibleControls
        };
      });

      if (detail.path !== route) {
        failures.push(`${route}: expected path ${route}, saw ${detail.path}`);
      }
      if (!detail.hasMain || !detail.heading) {
        failures.push(`${route}: main content or page heading did not render.`);
      }
      if (detail.viteOverlay || hasViteOverlay(detail.bodyText)) {
        failures.push(`${route}: Vite error overlay or transform error text was detected.`);
      }
      if (consoleErrors.length || pageErrors.length) {
        failures.push(`${route}: console/page errors: ${[...consoleErrors, ...pageErrors].slice(0, 3).join(" | ")}`);
      }
      if (route === "/dashboard" && !/Broker execution disabled|No live trading/i.test(detail.bodyText)) {
        failures.push("/dashboard: broker execution disabled safety state was not visible.");
      }
      if (chartRoutes.has(route) && detail.canvasCount === 0 && !detail.chartFallback) {
        failures.push(`${route}: expected a chart canvas or chart fallback.`);
      }
      const unsafeControls = detail.visibleControls.filter(hasUnsafeExecutionControl);
      if (unsafeControls.length) {
        failures.push(`${route}: unsafe execution-like control text detected: ${unsafeControls.slice(0, 3).join(" | ")}`);
      }

      routeResults.push({
        route,
        canvasCount: detail.canvasCount,
        heading: detail.heading
      });
    } catch (error) {
      failures.push(`${route}: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  await runNavigationSmoke(context, baseUrl, failures);
  await browser.close();

  return {
    failures,
    mode: "playwright",
    routeResults,
    skipped: [],
    warnings
  };
}

async function runNavigationSmoke(context, baseUrl, failures) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: routeTimeoutMs });
    for (const route of ["/market-data", "/walk-forward", "/self-improvement", "/settings"]) {
      await page.locator(`nav a[href="${route}"]`).click({ timeout: 10000 });
      await page.waitForTimeout(250);
      const path = await page.evaluate(() => location.pathname);
      if (path !== route) {
        failures.push(`navigation: clicking ${route} landed on ${path}`);
      }
    }
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: routeTimeoutMs });
    await page.getByRole("button", { name: "Advanced Lab" }).click();
    await page.locator('nav a[href="/ict-lab"]').click({ timeout: 10000 });
    await page.waitForTimeout(250);
    const advancedPath = await page.evaluate(() => location.pathname);
    if (advancedPath !== "/ict-lab") {
      failures.push(`navigation: Advanced Lab ICT Lab click landed on ${advancedPath}`);
    }
  } finally {
    await page.close();
  }
}

async function runHttpSmoke(baseUrl, initialWarnings = []) {
  const failures = [];
  const routeResults = [];

  for (const route of allRoutes) {
    try {
      const response = await requestText(`${baseUrl}${route}`);
      if (response.statusCode !== 200) {
        failures.push(`${route}: expected HTTP 200, saw ${response.statusCode}`);
      }
      if (!response.body.includes('id="root"')) {
        failures.push(`${route}: response did not include the React root element.`);
      }
      if (hasViteOverlay(response.body)) {
        failures.push(`${route}: Vite error overlay or transform error text was detected in HTML.`);
      }
      routeResults.push({ route, statusCode: response.statusCode });
    } catch (error) {
      failures.push(`${route}: ${error.message}`);
    }
  }

  return {
    failures,
    mode: "http",
    routeResults,
    skipped: [
      "console error inspection",
      "chart canvas rendering",
      "client-side navigation",
      "dashboard safety text visibility",
      "interactive execution-control scan"
    ],
    warnings: initialWarnings
  };
}

function printSummary(result, baseUrl) {
  log(`GoTrader route smoke (${result.mode})`);
  log(`Base URL: ${baseUrl}`);
  log("");
  for (const item of result.routeResults) {
    const extra = item.heading ? ` - ${item.heading}${item.canvasCount ? ` (${item.canvasCount} canvas)` : ""}` : "";
    log(`PASS ${item.route}${extra}`);
  }
  if (result.warnings.length) {
    log("");
    log("Warnings:");
    for (const warning of result.warnings) {
      log(`- ${warning}`);
    }
  }
  if (result.skipped.length) {
    log("");
    log("Skipped browser-only checks:");
    for (const skipped of result.skipped) {
      log(`- ${skipped}`);
    }
    log("");
    log("Install Playwright later to enable full rendered-route checks.");
  }
  if (result.failures.length) {
    log("");
    log("Failures:");
    for (const failure of result.failures) {
      log(`FAIL ${failure}`);
    }
  }
}

async function main() {
  const server = await startPreviewServer();
  try {
    const playwright = await tryLoadPlaywright();
    const result = playwright ? await runBrowserSmoke(server.baseUrl, playwright) : await runHttpSmoke(server.baseUrl);
    printSummary(result, server.baseUrl);
    if (result.failures.length) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
