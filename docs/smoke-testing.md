# Route Smoke Testing

GoTrader AI Lab includes a lightweight route smoke test for quick regression checks after UI, routing, charting, or runtime snapshot changes.

## Command

```bash
npm run build
npm run smoke:routes
```

The smoke command starts a tiny local static server from `dist` unless `SMOKE_BASE_URL` is provided.

```bash
SMOKE_BASE_URL=http://127.0.0.1:5181 npm run smoke:routes
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

## Modes

### HTTP Fallback Mode

The current repository does not include Playwright. Without Playwright, `npm run smoke:routes` performs a dependency-free built-app route check:

- each route returns HTTP 200 from the built static app
- each route serves the React root
- no Vite transform or error-overlay text appears in the HTML

Browser-only checks are reported as skipped in this mode:

- console error inspection
- chart canvas rendering
- client-side navigation
- dashboard safety text visibility
- interactive execution-control scan

### Playwright Mode

If the `playwright` package is added later, the same script automatically upgrades to a rendered browser smoke test. In that mode it checks:

- route loads without Vite overlay
- no obvious console/page errors
- main content renders
- Dashboard shows broker execution disabled
- chart routes render a canvas or chart fallback
- nav clicks move between primary routes without refresh
- Advanced Lab can expand and navigate to ICT Lab
- visible controls do not expose broker/live/order execution actions

If Playwright is installed but Chromium is missing, the script falls back to HTTP mode and prints a warning.

## Environment

Optional environment variables:

- `SMOKE_BASE_URL`: use an already-running app instead of starting the built-app static server.
- `SMOKE_PORT`: preferred local static-server port.
- `SMOKE_ROUTE_TIMEOUT_MS`: per-route timeout, default `15000`.

## Safety Expectation

Smoke testing is read-only. It must not enable broker execution, live trading, Tradovate, TopStep, websocket feeds, readiness override, or order execution.

## When To Run

Run this after changes to:

- `src/App.tsx`
- `src/components/AppShell.tsx`
- Dashboard mission-control components
- charting components
- runtime snapshot selectors
- route-level pages
- safety banners or readiness displays
