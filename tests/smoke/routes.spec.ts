import { expect, test, type Page } from "@playwright/test";

const primaryRoutes = [
  "/dashboard",
  "/advisor",
  "/research-advisor",
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

const allRoutes = [...primaryRoutes, ...advancedRoutes];
const chartRoutes = ["/dashboard", "/ict-lab", "/replay", "/backtest-lab", "/market-data"];
const unsafeExecutionControls = [
  "Place Order",
  "Buy Market",
  "Sell Market",
  "Enable Live Trading",
  "Connect Live Broker"
];
const pageErrorsByTest = new Map<string, string[]>();
const consoleErrorsByTest = new Map<string, string[]>();

const expectedHeadings: Record<string, RegExp> = {
  "/dashboard": /Command Center/i,
  "/advisor": /Research Advisor/i,
  "/research-advisor": /Research Advisor/i,
  "/market-data": /Market Data/i,
  "/autonomous-research": /Autonomous Research/i,
  "/walk-forward": /Walk-Forward/i,
  "/self-improvement": /Self-Improvement/i,
  "/readiness-gate": /Readiness/i,
  "/performance": /Performance/i,
  "/communications": /Communications/i,
  "/settings": /Settings/i,
  "/ict-lab": /ICT Lab/i,
  "/replay": /Replay/i,
  "/backtest-lab": /Backtest Lab/i,
  "/validation": /Validation/i,
  "/research-quality": /Research Quality/i,
  "/auto-research": /Auto Research/i,
  "/agent-debate": /Agent Debate/i,
  "/agent-audit": /Agent Audit/i,
  "/llm-agents": /LLM/i,
  "/evidence-quality": /Evidence Quality/i,
  "/research-maturity": /Research Maturity/i,
  "/simulation-runbook": /Verification Runbook|Simulation verification/i
};

test.describe("GoTrader browser route smoke", () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const rendered = `${message.text()} ${message.location().url ?? ""}`;
        if (!isExpectedOptionalLocalBridgeError(rendered)) {
          consoleErrors.push(rendered);
        }
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    pageErrorsByTest.set(test.info().testId, pageErrors);
    consoleErrorsByTest.set(test.info().testId, consoleErrors);
  });

  test.afterEach(async () => {
    const pageErrors = pageErrorsByTest.get(test.info().testId) ?? [];
    const consoleErrors = consoleErrorsByTest.get(test.info().testId) ?? [];
    expect([...pageErrors, ...consoleErrors], "No severe browser errors should occur").toEqual([]);
  });

  for (const route of allRoutes) {
    test(`${route} loads without crashing`, async ({ page }) => {
      await gotoRoute(page, route);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("main")).toContainText(expectedHeadings[route]);
      await expect(page.locator("vite-error-overlay,#vite-error-overlay")).toHaveCount(0);
      await expect(page.getByText(/Internal server error|\[plugin:vite|Transform failed/i)).toHaveCount(0);
      await expectNoVisibleExecutionControls(page);
    });
  }

  test("sidebar navigation works without full refresh", async ({ page }) => {
    await gotoRoute(page, "/dashboard");
    await page.evaluate(() => {
      (window as Window & { __gotraderSmokeNavigationMarker?: string }).__gotraderSmokeNavigationMarker = crypto.randomUUID();
    });
    const marker = await page.evaluate(() => (window as Window & { __gotraderSmokeNavigationMarker?: string }).__gotraderSmokeNavigationMarker);

    for (const route of ["/market-data", "/settings", "/dashboard"]) {
      await page.locator(`nav a[href="${route}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
      await expect(page.locator("main")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => (window as Window & { __gotraderSmokeNavigationMarker?: string }).__gotraderSmokeNavigationMarker))
        .toBe(marker);
    }
  });

  test("dashboard shows command-center safety locks and progress panel", async ({ page }) => {
    await gotoRoute(page, "/dashboard");
    await expect(page.getByText("Broker execution disabled").first()).toBeVisible();
    await expect(page.getByText(/Simulation research only|Command Center can start research loops only/i).first()).toBeVisible();
    await expect(page.getByText(/Go-Trader gate/i).first()).toBeVisible();
    await expect(page.getByText(/Tradovate gate|Tradovate Future Gate/i).first()).toBeVisible();
    await expect(page.getByText("Loop progress")).toBeVisible();
  });

  test("ICT Strategy Suite advisor panels render in advisor workspace and dashboard", async ({ page }) => {
    await gotoRoute(page, "/advisor");
    await expect(page.locator("main")).toContainText(/ICT Strategy Suite Phase 1|ICT Advisor is waiting/i);
    await expect(page.locator("main")).toContainText(/Packet Safety Contract/i);

    await gotoRoute(page, "/research-advisor");
    await expect(page.locator("main")).toContainText(/ICT Strategy Suite Phase 1|ICT Advisor is waiting/i);

    await gotoRoute(page, "/dashboard");
    await expect(page.locator("main")).toContainText(/ICT Advisor Phase 1/i);
    await expect(page.locator("main")).toContainText(/Open Advisor/i);
  });

  test("chart surfaces render canvas or a safe fallback", async ({ page }) => {
    for (const route of chartRoutes) {
      await gotoRoute(page, route);
      await expectChartOrFallback(page, route);
      await expectNoVisibleExecutionControls(page);
    }
  });

  test("replay page still renders after chart-route navigation", async ({ page }) => {
    await gotoRoute(page, "/ict-lab");
    await expectChartOrFallback(page, "/ict-lab");
    await gotoRoute(page, "/replay");
    await expect(page.locator("main")).toContainText(/Replay/i);
    await expectChartOrFallback(page, "/replay");
  });

  test("multi-broker architecture status is visible and locked", async ({ page }) => {
    await gotoRoute(page, "/settings");
    await expect(page.getByText("Multi-Broker Architecture")).toBeVisible();
    await expect(page.getByText("TradingView MCP", { exact: true })).toBeVisible();
    await expect(page.getByText("TradingView MCP Evidence Bridge")).toBeVisible();
    await expect(page.getByText(/chart evidence only|analysis/i).first()).toBeVisible();
    await expect(page.getByText("Tradovate").first()).toBeVisible();
    await expect(page.getByText("MT5").first()).toBeVisible();
    await expect(page.getByText("Broker execution").first()).toBeVisible();
    await expect(page.getByText(/Live trading/i).first()).toBeVisible();
    await expect(page.getByText(/Readiness override/i).first()).toBeVisible();
  });
});

async function gotoRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
}

async function expectChartOrFallback(page: Page, route: string) {
  const canvasCount = await page.locator("canvas").count();
  if (canvasCount > 0) {
    expect(canvasCount, `${route} should render at least one chart canvas`).toBeGreaterThan(0);
    return;
  }
  await expect(page.getByText(/Chart unavailable|No candles|No chart data|preview unavailable|data unavailable/i)).toBeVisible();
}

async function expectNoVisibleExecutionControls(page: Page) {
  for (const label of unsafeExecutionControls) {
    const locator = page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label }));
    await expect(locator).toHaveCount(0);
  }
}

function isExpectedOptionalLocalBridgeError(message: string) {
  return message.includes("127.0.0.1:8787/health") || message.includes("localhost:8787/health");
}
