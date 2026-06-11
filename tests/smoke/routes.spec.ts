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

// Expected coverage: all 27 routes from src/App.tsx, reachable through the
// 8 sidebar hubs and their workspace tabs. Excluded: "/" and "*" redirects
// and the "/agents/:id" detail route. Keep this list in sync with
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
    // Loop progress lives in the collapsed state-and-metrics section.
    await expandDeferredDetails(page, "dashboard-state-metrics");
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
    // Advisor workspace tabs: Chat is the default tab so chat is never buried.
    await expect(page.getByTestId("advisor-workspace-tabs")).toBeVisible();
    for (const tab of ["chat", "source", "validation", "openclaw", "notes"]) {
      await expect(page.getByTestId(`advisor-tab-${tab}`)).toBeVisible();
    }
    await expect(page.getByTestId("research-advisor-chat-card")).toBeVisible();
    await expect(page.getByTestId("research-advisor-chat-input")).toBeVisible();
    await expect(page.getByTestId("research-advisor-quick-actions")).toContainText(/Explain this cycle/i);
    await expect(page.getByRole("button", { name: "Activate Market" }).first()).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toBeVisible();
    await expect(page.getByTestId("activate-market-progress")).toContainText(/Activate Market Workflow/i);
    await expect(page.locator("main")).toContainText(/Setup/i);

    await page.getByTestId("advisor-tab-source").click();
    await expect(page.getByTestId("research-advisor-source-controls")).toBeVisible();
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Requested GoTrader symbol/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/MT5 broker symbol/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Primary timeframe/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Higher-timeframe context/i);

    await page.getByTestId("advisor-tab-validation").click();
    await expect(page.locator("main")).toContainText(/Replay/i);
    await expect(page.locator("main")).toContainText(/Scorecard/i);

    await page.getByTestId("advisor-tab-openclaw").click();
    await expect(page.locator("main")).toContainText(/Packet Safety Contract/i);

    await page.getByTestId("advisor-tab-notes").click();
    await expect(page.locator("main")).toContainText(/ICT Strategy Suite|ICT Advisor is waiting/i);

    await gotoRoute(page, "/research-advisor");
    await expect(page.locator("main")).toContainText(/Research Advisor/i);
    await expect(page.locator("main")).toContainText(/ICT research assistant for read-only market analysis/i);
    await expect(page.locator("main")).toContainText(/MT5 Read Only/i);
    await expect(page.locator("main")).toContainText(/Research Only/i);
    await expect(page.locator("main")).toContainText(/Authority: None/i);

    await page.getByTestId("advisor-tab-source").click();
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/MT5 Research Source/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/display\/reference only/i);
    await expect(page.getByTestId("research-advisor-source-controls")).toContainText(/Each timeframe is cached as a separate canonical MT5 read-only source key/i);

    await page.getByTestId("advisor-tab-chat").click();
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
    // Chat is the default tab; heavy manual panels only mount on the Validation tab.
    await expect(page.getByTestId("ict-manual-replay-review")).toHaveCount(0);
    await expect(page.getByTestId("ict-market-scorecard")).toHaveCount(0);

    await page.getByTestId("advisor-tab-validation").click();
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

    await page.getByTestId("advisor-tab-notes").click();
    await expandDeferredDetails(page, "advisor-ict-suite-section");
    await expect(page.locator("main")).toContainText(/ICT Strategy Suite|ICT Advisor is waiting/i);
    await expect(page.locator("main")).toContainText(/Strategy Calibration|ICT Advisor is waiting/i);
    await expect(page.getByTestId("ict-current-read-data-flow")).toContainText(/Current Read Data Flow/i);
    await expandDeferredDetails(page, "ict-current-read-data-flow");
    await expect(page.getByTestId("ict-current-read-data-flow")).toContainText(/Model quality lane/i);
    await expect(page.locator("main")).toContainText(/raw candles|Raw candles/i);
    await expect(page.locator("main")).not.toContainText(/\"candles\"\\s*:/i);
    await expect(page.locator("main")).not.toContainText(/accountNumber|orderId|positionId/i);
    await expandDeferredDetails(page, "advisor-saved-reports-section");
    await expect(page.getByTestId("ict-saved-research-reports")).toContainText(/Saved Research Reports/i);

    // Returning to Chat keeps chat front-and-center and unmounts manual panels.
    await page.getByTestId("advisor-tab-chat").click();
    await expect(page.getByTestId("research-advisor-chat-card")).toBeVisible();
    await expect(page.getByTestId("ict-manual-replay-review")).toHaveCount(0);

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

  test("recognition-to-validation chain surfaces render with safe defaults", async ({ page }) => {
    // ICT Lab recognition cards expose a validation CTA (queue or activate-MT5).
    await gotoRoute(page, "/ict-lab");
    const ictCta = page.getByTestId("ict-recognition-cta").first();
    await expect(ictCta).toBeVisible();
    await expect(ictCta).toContainText(/Queue replay validation|Activate MT5 before validation/i);
    await expect(ictCta).toContainText(/Open Replay/i);
    await expect(page.getByTestId("validation-chain-card").first()).toBeVisible();

    // Replay page shows the validation chain status.
    await gotoRoute(page, "/replay");
    const replayChain = page.getByTestId("replay-validation-chain");
    await expect(replayChain).toBeVisible();
    await expect(replayChain).toContainText(/Validation chain/i);
    await expect(replayChain.getByTestId("validation-chain-status")).toBeVisible();
    await expect(replayChain).toContainText(/Authority: none/i);

    // Walk-Forward page shows the chain next action/status.
    await gotoRoute(page, "/walk-forward");
    const wfChain = page.getByTestId("walk-forward-validation-chain");
    await expect(wfChain).toBeVisible();
    await expect(wfChain.getByTestId("validation-chain-status")).toBeVisible();

    // Advisor surfaces the validation chain status card on the Validation tab.
    await gotoRoute(page, "/research-advisor");
    await page.getByTestId("advisor-tab-validation").click();
    const advisorChain = page.getByTestId("advisor-validation-chain");
    await expect(advisorChain).toBeVisible();
    await expect(advisorChain).toContainText(/Validation chain/i);
    await expect(advisorChain).toContainText(/Recognition is not evidence|Recognition only/i);

    // Dashboard shows the compact validation chain summary.
    await gotoRoute(page, "/dashboard");
    const dashboardChain = page.getByTestId("validation-chain-card").first();
    await expect(dashboardChain).toBeVisible();
    await expect(dashboardChain.getByTestId("validation-chain-status")).toBeVisible();
    await expect(dashboardChain).toContainText(/Authority: none/i);
  });

  test("advisor provider status and OpenClaw pilot clarity surfaces render safely", async ({ page }) => {
    await gotoRoute(page, "/research-advisor");

    // Deterministic chat is labeled as local deterministic guidance on the default Chat tab.
    await expect(page.getByTestId("research-advisor-chat-mode")).toContainText(/Local deterministic/i);
    await expect(page.getByTestId("research-advisor-chat-card")).toContainText(/Deterministic Research Helper/i);

    // Validation-chain explanation panel: detailed rows + recognition is not evidence.
    await page.getByTestId("advisor-tab-validation").click();
    const advisorChain = page.getByTestId("advisor-validation-chain");
    await expect(advisorChain).toBeVisible();
    await expect(advisorChain.getByTestId("validation-chain-recognition-is-evidence")).toContainText(
      /Recognition is evidence: false/i
    );

    // Provider status header with mode, status chip, last checked, and authority none.
    await page.getByTestId("advisor-tab-openclaw").click();
    const providerHeader = page.getByTestId("advisor-provider-status");
    await expect(providerHeader).toBeVisible();
    await expect(providerHeader.getByTestId("advisor-provider-mode")).toBeVisible();
    await expect(providerHeader.getByTestId("advisor-provider-authority")).toContainText(/Authority: none/i);
    await expect(providerHeader.getByTestId("advisor-provider-last-checked")).toBeVisible();
    await expect(providerHeader).toContainText(/Deterministic Research Helper/i);

    // Status chip never claims ordinary success in the default unchecked state.
    const statusChip = providerHeader.getByTestId("advisor-provider-status-chip");
    await expect(statusChip).toBeVisible();
    const statusChipText = (await statusChip.innerText()).trim();
    expect(statusChipText).toMatch(/not checked|not configured|config missing|disabled|deterministic|stub|offline|timeout/i);
    expect(statusChipText).not.toMatch(/^(online|ready|connected)$/i);

    // OpenClaw pilot card: advisory/proposal-only with auto-apply locked off.
    const pilotCard = page.getByTestId("openclaw-pilot-card");
    await expect(pilotCard).toBeVisible();
    await expect(pilotCard).toContainText(/advisory\/proposal-only/i);
    await expect(pilotCard.getByTestId("openclaw-pilot-auto-apply")).toContainText(/autoApplyAllowed: false/i);
    await expect(pilotCard).toContainText(/executionAuthority: none/i);
    await expect(pilotCard).toContainText(/readinessOverrideAuthority: none/i);
    await expect(pilotCard.getByTestId("openclaw-pilot-chain-status")).toBeVisible();

    // Dashboard compact advisor stays compact: provider status only, no chat input.
    await gotoRoute(page, "/dashboard");
    const compactAdvisor = page.getByTestId("dashboard-compact-advisor");
    await expect(compactAdvisor).toBeVisible();
    await expect(compactAdvisor.getByTestId("dashboard-advisor-provider-mode")).toContainText(/Provider/i);
    await expect(compactAdvisor).toContainText(/OpenClaw status/i);
    await expect(compactAdvisor).toContainText(/Open Advisor/i);
    expect(await compactAdvisor.locator("input, textarea").count()).toBe(0);
  });

  test("redesigned app shell shows 8 hubs, source bar, workspace tabs, and safety strip", async ({ page }) => {
    await gotoRoute(page, "/dashboard");

    // 8 sidebar hubs.
    for (const hub of ["home", "advisor", "data", "validate", "evidence", "automate", "agents", "settings"]) {
      await expect(page.getByTestId(`nav-hub-${hub}`)).toBeVisible();
    }

    // Breadcrumb reflects hub + page.
    await expect(page.getByTestId("app-breadcrumb")).toContainText(/Home/i);
    await expect(page.getByTestId("app-breadcrumb")).toContainText(/Command Center/i);

    // Global top source bar with authority none.
    const sourceBar = page.getByTestId("global-source-bar");
    await expect(sourceBar).toBeVisible();
    await expect(sourceBar).toContainText(/Authority: none/i);

    // Footer safety strip.
    const strip = page.getByTestId("footer-safety-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText(/Research only/i);
    await expect(strip).toContainText(/MT5 read-only/i);
    await expect(strip).toContainText(/Execution authority none/i);
    await expect(strip).toContainText(/Broker authority none/i);
    await expect(strip).toContainText(/Readiness override none/i);

    // Workspace tabs render for multi-route hubs and keep legacy routes reachable.
    await gotoRoute(page, "/replay");
    const tabs = page.getByTestId("workspace-tabs");
    await expect(tabs).toBeVisible();
    await expect(tabs).toContainText(/Walk-Forward/i);
    await expect(tabs).toContainText(/Backtest Lab/i);
    await tabs.locator('a[href="/walk-forward"]').click();
    await expect(page).toHaveURL(/\/walk-forward$/);
    await expect(page.locator("main")).toContainText(/Walk-Forward/i);

    // Right-side context panel slot toggles and shows the validation chain.
    await page.getByTestId("context-panel-toggle").click();
    await expect(page.getByTestId("context-panel")).toBeVisible();
    await expect(page.getByTestId("context-panel-validation-chain")).toBeVisible();
    await expect(page.getByTestId("context-panel-validation-chain")).toContainText(/Authority: none/i);
    await page.getByTestId("context-panel-toggle").click();
    await expect(page.getByTestId("context-panel")).toHaveCount(0);

    await expectNoVisibleExecutionControls(page);
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
