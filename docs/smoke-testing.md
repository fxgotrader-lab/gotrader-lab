# Browser Smoke Testing

GoTrader AI Lab now uses Playwright for real browser smoke testing. The suite verifies route rendering, client-side navigation, chart surfaces, Command Center safety locks, and critical no-execution UI guarantees.

## Commands

Build first, then run the browser smoke suite:

```bash
npm run build
npm run smoke:routes
```

Equivalent commands:

```bash
npm run smoke:browser
npm run test:smoke
```

The older dependency-free HTTP checker remains available for quick static route checks:

```bash
npm run smoke:http
```

## Playwright Browser Install

The project uses `@playwright/test` and Chromium. If Chromium is missing on a new machine, run:

```bash
npx playwright install chromium
```

## Routes Covered

Primary autonomous workflow routes:

- `/dashboard`
- `/market-data`
- `/autonomous-research`
- `/walk-forward`
- `/self-improvement`
- `/readiness-gate`
- `/performance`
- `/communications`
- `/settings`

Advanced routes:

- `/ict-lab`
- `/replay`
- `/backtest-lab`
- `/validation`
- `/research-quality`
- `/auto-research`
- `/agent-debate`
- `/agent-audit`
- `/llm-agents`
- `/evidence-quality`
- `/research-maturity`
- `/simulation-runbook`

Chart routes:

- `/dashboard`
- `/ict-lab`
- `/replay`
- `/backtest-lab`
- `/market-data`

## Browser Checks

The Playwright suite checks:

- page loads without a Vite overlay
- no uncaught page errors
- no severe console errors
- main content is visible
- primary sidebar navigation works without full document refresh
- dashboard shows broker execution disabled and safety language
- Command Center progress panel is visible
- Go-Trader and Tradovate gates remain locked
- chart routes render a canvas or safe fallback
- replay still renders after navigation from another chart route
- Settings shows the multi-broker architecture status
- no visible order/live/broker execution controls are exposed

## Environment

Optional variables:

- `PLAYWRIGHT_BASE_URL`: use an already-running app instead of starting `vite preview`.
- `PLAYWRIGHT_PORT`: preview port, default `4173`.

The tests run against the built app in `dist`, served by `scripts/playwright-static-server.mjs` through the wrapper `scripts/run-playwright-smoke.mjs`, so `npm run build` should run first. The wrapper starts a free local port, sets `PLAYWRIGHT_BASE_URL`, runs Playwright, and shuts the static server down after the suite.

## Safety Expectation

Smoke testing is read-only. It must not require:

- OpenAI API keys
- LLM bridge
- imported MNQ data
- Tradovate
- MT5
- broker credentials
- websocket feeds

It must not enable:

- broker execution
- live trading
- order placement
- go-trader handoff
- readiness override

## Reports

Playwright HTML and trace artifacts are ignored by git:

- `playwright-report/`
- `test-results/`
