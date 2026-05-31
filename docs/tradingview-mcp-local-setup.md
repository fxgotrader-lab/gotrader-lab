# TradingView MCP Local Setup

## Recommendation

GoTrader expects a small local HTTP bridge at:

```text
http://127.0.0.1:7331
```

The upstream `tradesdontlie/tradingview-mcp` project does not expose this HTTP shape directly. It is primarily an MCP server and CLI that talks to TradingView Desktop through Chrome DevTools Protocol. GoTrader therefore uses a local wrapper script to adapt read-only upstream CLI evidence into:

- `GET /health`
- `GET /status`
- `GET /`
- `POST /evidence`
- `GET /evidence?symbol=...&timeframe=...`

The wrapper is evidence-only. It does not execute trades, connect brokers, place orders, change readiness, or mark chart data as a live broker feed.

## What Upstream Provides

The upstream README describes:

- Node.js MCP server entry: `node /path/to/tradingview-mcp/src/server.js`
- CLI entry: `node src/cli/index.js <command>` or linked `tv <command>`
- TradingView Desktop connection through CDP on port `9222`
- read/chart commands such as `status`, `quote`, `ohlcv --summary`, screenshots, indicator values, and stream commands
- chart-control commands as well, which GoTrader should treat carefully and not use for execution

The README also states that the project interacts with local TradingView Desktop through CDP, requires TradingView Desktop with debug port enabled, and does not execute real trades.

Reference: https://github.com/tradesdontlie/tradingview-mcp

## Install Upstream TradingView MCP

Clone the upstream repo outside GoTrader:

```powershell
git clone https://github.com/tradesdontlie/tradingview-mcp.git C:\Users\andre\tradingview-mcp
cd C:\Users\andre\tradingview-mcp
npm install
```

Launch TradingView Desktop with the CDP debug port enabled. Upstream documents a Windows helper script, and also the generic Chromium/Electron flag:

```powershell
TradingView.exe --remote-debugging-port=9222
```

Then verify upstream CLI access from the upstream repo:

```powershell
node src/cli/index.js status
node src/cli/index.js quote
node src/cli/index.js ohlcv --summary
```

## Start the GoTrader HTTP Wrapper

From the GoTrader repo:

```powershell
$env:TRADINGVIEW_MCP_REPO_DIR="C:\Users\andre\tradingview-mcp"
npm.cmd run tradingview:mcp-bridge
```

Defaults:

- host: `127.0.0.1`
- port: `7331`
- bridge URL: `http://127.0.0.1:7331`
- upstream CLI path: `%TRADINGVIEW_MCP_REPO_DIR%\src\cli\index.js`

Optional overrides:

```powershell
$env:TRADINGVIEW_MCP_BRIDGE_HOST="127.0.0.1"
$env:TRADINGVIEW_MCP_BRIDGE_PORT="7331"
$env:TRADINGVIEW_MCP_CLI="C:\Users\andre\tradingview-mcp\src\cli\index.js"
$env:TRADINGVIEW_MCP_CLI_TIMEOUT_MS="4000"
```

The wrapper can run without `TRADINGVIEW_MCP_REPO_DIR`; it will report that the wrapper is running but upstream is not configured.

## Test the Bridge

From GoTrader:

```powershell
npm.cmd run test:tradingview-mcp
```

If the wrapper is not running, the test reports disconnected and exits successfully. That is intentional so build/smoke validation does not require TradingView Desktop.

Manual checks:

```powershell
Invoke-RestMethod http://127.0.0.1:7331/health
Invoke-RestMethod http://127.0.0.1:7331/status
Invoke-RestMethod "http://127.0.0.1:7331/evidence?symbol=MNQ&timeframe=5m"
```

In the app:

1. Open `/settings`.
2. Find `TradingView MCP Evidence Bridge`.
3. Confirm URL is `http://127.0.0.1:7331`.
4. Enable local status checks.
5. Click `Check status`.
6. Click `Fetch chart evidence`.

## Evidence Shape

The wrapper returns bounded evidence:

- symbol/timeframe
- chart source label
- latest visible price if available
- compact OHLCV summary if available
- technical summary
- warnings
- missing evidence
- authority fields set to `none`

It does not return raw unrestricted upstream payloads to the app as broker truth.

## Safety Rules

TradingView MCP is chart evidence only.

It cannot:

- place orders
- approve risk
- approve readiness
- send broker orders
- send go-trader handoff
- change MT5 or Tradovate state
- expose API keys
- mark GoTrader charts as LIVE

GoTrader charts should show LIVE only when a true live candle feed adapter reports connected status. TradingView evidence being connected is not enough.

## Troubleshooting

If `/health` says upstream is not configured:

- set `TRADINGVIEW_MCP_REPO_DIR`
- confirm `src/cli/index.js` exists in that repo

If upstream is configured but disconnected:

- start TradingView Desktop with `--remote-debugging-port=9222`
- run upstream `node src/cli/index.js status`
- ensure no firewall blocks localhost

If GoTrader Settings still shows disconnected:

- keep the wrapper terminal open
- check that the URL matches `http://127.0.0.1:7331`
- click `Check status` again

## Current Limits

The GoTrader wrapper currently uses read-only CLI commands:

- `status`
- `quote`
- `ohlcv --summary`

It does not collect screenshots, indicator values, Pine drawing levels, or multi-pane evidence yet. Those can be added later as bounded evidence mappings, still with no execution authority.
