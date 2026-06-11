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
  "/research",
  "/agent-debate",
  "/agent-audit",
  "/llm-agents",
  "/evidence-quality",
  "/research-maturity",
  "/simulation-runbook",
  "/advisory-agents",
  "/agents",
  "/prompt-lab"
];

// Expected coverage: all 27 sidebar-reachable routes from src/App.tsx
// (11 primary + 16 advanced). Excluded: "/" and "*" redirects and the
// "/agents/:id" detail route. Keep this list in sync with
// scripts/smoke-routes.mjs.
const allRoutes = [...primaryRoutes, ...advancedRoutes];
const chartRoutes = ["/dashboard", "/ict-lab", "/replay", "/backtest-lab", "/market-data"];
const sourceStatusRoutes = [
  "/dashboard",
  "/advisor",
  "/market-data",
  "/ict-lab",
  "/backtest-lab",
  "/replay",
  "/walk-forward",
  "/agent-debate",
  "/self-improvement",
  "/evidence-quality",
  "/research-maturity"
];
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
  "/research": /AI Research Workbench/i,
  "/agent-debate": /Agent Debate/i,
  "/agent-audit": /Agent Audit/i,
  "/llm-agents": /LLM/i,
  "/evidence-quality": /Evidence Quality/i,
  "/research-maturity": /Research Maturity/i,
  "/simulation-runbook": /Verification Runbook|Simulation verification/i,
  "/advisory-agents": /OpenClaw \/ Hermes Planning/i,
  "/agents": /Research Agents/i,
  "/prompt-lab": /Prompt Lab/i
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
    await expect(page.locator("main")).toContainText(/MT5-first research cockpit/i);
    await expect(page.locator("main")).toContainText(/Composite ICT bias/i);
    await expect(page.locator("main")).toContainText(/Replay score/i);
    await expect(page.locator("main")).toContainText(/Broker execution disabled/i);
    await expect(page.locator("main")).toContainText(/Simulation research only|Command Center can start research loops only/i);
    await expect(page.locator("main")).toContainText(/Go-Trader gate/i);
    await expect(page.locator("main")).toContainText(/Tradovate gate|Tradovate Future Gate/i);
    await expect(page.locator("main")).toContainText(/Loop progress/i);
    await expect(page.getByRole("button", { name: "Activate Market" }).first()).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toContainText(/Activate Market Workflow/i);
  });

  test("dashboard Results tab and /performance share the upgraded results page", async ({ page }) => {
    await gotoRoute(page, "/performance");
    await expectUpgradedResultsPage(page);

    await gotoRoute(page, "/dashboard");
    await page.getByRole("button", { name: "Results", exact: true }).click();
    await expectUpgradedResultsPage(page);
    await expectNoVisibleExecutionControls(page);
  });

  test("ICT Strategy Suite advisor panels render in advisor workspace and dashboard", async ({ page }) => {
    await gotoRoute(page, "/advisor");
    await expect(page.locator("main")).toContainText(/Research Advisor/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toBeVisible();
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Requested GoTrader symbol/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/MT5 broker symbol/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Primary timeframe/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Higher-timeframe context/i);
    await expect(page.getByTestId("research-advisor-chat-card")).toBeVisible();
    await expect(page.getByTestId("research-advisor-chat-input")).toBeVisible();
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Explain this cycle/i);
    await expect(page.getByRole("button", { name: "Activate Market" }).first()).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toContainText(/Activate Market Workflow/i);
    await expect(page.locator("main")).toContainText(/Setup/i);
    await expect(page.locator("main")).toContainText(/Replay/i);
    await expect(page.locator("main")).toContainText(/Scorecard/i);
    await expect(page.locator("main")).toContainText(/ICT Strategy Suite|ICT Advisor is waiting/i);
    await expect(page.locator("main")).toContainText(/Packet Safety Contract/i);

    await gotoRoute(page, "/research-advisor");
    await expect(page.locator("main")).toContainText(/Research Advisor/i);
    await expect(page.locator("main")).toContainText(/ICT research assistant for read-only market analysis/i);
    await expect(page.locator("main")).toContainText(/MT5 Read Only/i);
    await expect(page.locator("main")).toContainText(/Research Only/i);
    await expect(page.locator("main")).toContainText(/Authority: None/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/MT5 Research Source/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/display\/reference only/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Each timeframe is cached as a separate canonical MT5 read-only source key/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Current Read/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Phase 1/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Phase 2/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Model lane/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Paper Sim|Paper-watchlist eligibility/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Execution Disabled|Execution/i);
    await expect(page.getByTestId("ict-current-read-panel")).toContainText(/Next action/i);
    await expect(page.getByRole("button", { name: "Activate Market" }).first()).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toContainText(/Activate Market Workflow/i);
    await expect(page.getByTestId("research-advisor-chat-card")).toBeVisible();
    await expect(page.getByTestId("research-advisor-chat-input")).toBeVisible();
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Explain this cycle/i);
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Why is this blocked/i);
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/What should I test next/i);
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Suggest calibration/i);
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Review self-improvement/i);
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Review Paper-Demo checklist/i);
    await expect(page.locator("main")).toContainText(/ICT Strategy Suite|ICT Advisor is waiting/i);
    await expect(page.locator("main")).toContainText(/Strategy Calibration|ICT Advisor is waiting/i);
    await expect(page.getByTestId("ict-current-read-data-flow")).toContainText(/Current Read Data Flow/i);
    await expandDeferredDetails(page, "ict-current-read-data-flow");
    await expect(page.getByTestId("ict-current-read-data-flow")).toContainText(/Model quality lane/i);
    await expect(page.locator("main")).toContainText(/raw candles|Raw candles/i);
    await expect(page.locator("main")).not.toContainText(/\"candles\"\\s*:/i);
    await expect(page.locator("main")).not.toContainText(/accountNumber|orderId|positionId/i);
    await expect(page.getByTestId("advisor-manual-replay-section")).toContainText(/deferred/i);
    await expect(page.getByTestId("advisor-market-scorecard-section")).toContainText(/deferred/i);
    await expect(page.getByTestId("ict-manual-replay-review")).toHaveCount(0);
    await expect(page.getByTestId("ict-market-scorecard")).toHaveCount(0);

    await expandDeferredDetails(page, "advisor-manual-replay-section");
    await expect(page.getByTestId("ict-manual-replay-review")).toContainText(/Manual ICT Replay Review/i);
    await expect(page.getByTestId("ict-manual-replay-status")).toContainText(/idle/i);
    await expect(page.getByRole("button", { name: "Run Real Replay Review" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Replay Report" })).toBeVisible();
    await expect(page.getByTestId("ict-monte-carlo-robustness")).toContainText(/Monte Carlo Robustness/i);
    await expect(page.getByTestId("ict-monte-carlo-status")).toContainText(/idle/i);
    await expect(page.getByTestId("ict-monte-carlo-robustness")).toContainText(/Run Replay Review first/i);
    await expect(page.getByRole("button", { name: "Run Monte Carlo Robustness" })).toBeVisible();
    await page.getByRole("button", { name: "Run Monte Carlo Robustness" }).click();
    await expect(page.getByTestId("ict-monte-carlo-status")).toContainText(/unavailable/i);
    await expect(page.getByTestId("ict-monte-carlo-robustness")).toContainText(/Run Replay Review first/i);
    await expect(page.locator("vite-error-overlay,#vite-error-overlay")).toHaveCount(0);

    await expandDeferredDetails(page, "advisor-profile-optimizer-section");
    await expect(page.getByTestId("ict-approved-profile-optimizer")).toContainText(/Optimize Approved Profile/i);
    await expect(page.getByTestId("ict-approved-profile-optimizer-status")).toContainText(/idle/i);
    await expect(page.getByRole("button", { name: "Run Profile Optimization" })).toBeVisible();

    await expandDeferredDetails(page, "advisor-market-scorecard-section");
    await expect(page.getByTestId("ict-market-scorecard")).toContainText(/ICT Market Scorecard/i);
    await expect(page.getByTestId("ict-market-scorecard-status")).toContainText(/idle/i);
    await expect(page.getByTestId("ict-market-scorecard").getByRole("button", { name: "Run Market Scorecard" })).toBeVisible();
    await expect(page.getByTestId("ict-market-scorecard").getByRole("button", { name: "Save Scorecard Report" })).toBeVisible();

    await expandDeferredDetails(page, "advisor-saved-reports-section");
    await expect(page.getByTestId("ict-saved-research-reports")).toContainText(/Saved Research Reports/i);
    const chatAppearsBeforeManualPanels = await page.evaluate(() => {
      const chat = document.querySelector("[data-testid='research-advisor-chat-card']");
      const replay = document.querySelector("[data-testid='ict-manual-replay-review']");
      const scorecard = document.querySelector("[data-testid='ict-market-scorecard']");
      return Boolean(
        chat &&
          replay &&
          scorecard &&
          (chat.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          (chat.compareDocumentPosition(scorecard) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    });
    expect(chatAppearsBeforeManualPanels).toBe(true);

    await gotoRoute(page, "/dashboard");
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Research Advisor/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Packet source/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Model lane/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Paper Sim/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Strategy Calibration/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Execution: Disabled/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Phase 1 \/ Phase 2/i);
    await expect(page.getByTestId("dashboard-research-advisor-card")).toContainText(/Open Advisor/i);
  });

  test("shared source status banner appears on key pages", async ({ page }) => {
    for (const route of sourceStatusRoutes) {
      await gotoRoute(page, route);
      const banner = page.getByTestId("source-status-banner").first();
      await expect(banner, `${route} should render the shared source status banner`).toBeVisible();
      await expect(banner).toContainText(/Authority: none/i);
      await expect
        .poll(
          async () => (await banner.textContent()) ?? "",
          { message: `${route} source banner should resolve a source status` }
        )
        .toMatch(/MT5 read-only|Imported historical|TradingView MCP|Mock\/sample data|Source unavailable/i);
    }
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
  const chartAttribution = page.getByRole("link", { name: /Charting by TradingView/i });
  if (await chartAttribution.count()) {
    await expect(chartAttribution.first()).toBeVisible();
    return;
  }
  const chartApplication = page.getByRole("application");
  if (await chartApplication.count()) {
    await expect(chartApplication.first()).toBeVisible();
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

async function expectUpgradedResultsPage(page: Page) {
  const main = page.locator("main");
  await expect(page.getByTestId("performance-results-page")).toBeVisible();
  await expect(page.getByTestId("results-calendar")).toBeVisible();
  await expect(page.getByTestId("results-calendar")).toContainText(/Monthly P\/L/i);
  await expect(main).toContainText(/Performance Results/i);
  await expect(main).toContainText(/Performance Curve/i);
  await expect(main).toContainText(/Outcome Log/i);
  await expect(main).toContainText(/Execution authority none/i);
  await expect(main).not.toContainText(/Simulation results cockpit/i);
  await expect(main).not.toContainText(/Monte Carlo Robustness|Run Real Replay Review|Run Market Scorecard/i);
  await expect(main).not.toContainText(/"candles"\s*:|accountNumber|orderId|positionId/i);
}

async function expandDeferredDetails(page: Page, testId: string) {
  const details = page.getByTestId(testId);
  await expect(details).toBeVisible();
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await details.locator("summary").click();
  }
}

function isExpectedOptionalLocalBridgeError(message: string) {
  return message.includes("127.0.0.1:8787/health") || message.includes("localhost:8787/health");
}
