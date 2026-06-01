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
- `GET /quote?symbol=...&timeframe=...`
- `GET /candles?symbol=...&timeframe=...&limit=...`
- `GET /snapshot?symbol=...&timeframe=...&limit=...`

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

## Run Diagnostics

From the GoTrader repo:

```powershell
npm.cmd run tradingview:diagnose
```

The diagnostic checks:

- `C:\Users\andre\tradingview-mcp`
- `C:\Users\andre\tradingview-mcp\src\cli\index.js`
- likely Windows `TradingView.exe` install locations
- Start Menu and Desktop shortcuts named `TradingView`
- OneDrive Desktop shortcuts, when Windows redirects the Desktop into OneDrive
- shortcut targets resolved through Windows `WScript.Shell`
- installed-app registry entries named `TradingView`
- Windows Start App and AppX package entries, including Microsoft Store-style installs
- `%LOCALAPPDATA%\Packages`, including `TradingView.Desktop_*` package data and Desktop App Installer hints
- PATH command aliases such as `TradingView.exe` or `tv.exe`
- currently running TradingView-like processes and their executable paths, when Windows exposes them
- TradingView Desktop CDP debug port `9222`
- GoTrader wrapper port `7331`
- upstream CLI `status`
- GoTrader wrapper `/health`

The output includes next-step instructions for whatever failed.

Launch TradingView Desktop with the CDP debug port enabled. Upstream documents a Windows helper script, and also the generic Chromium/Electron flag:

```powershell
TradingView.exe --remote-debugging-port=9222
```

If PowerShell cannot find `TradingView.exe`, use the GoTrader launcher:

```powershell
npm.cmd run tradingview:start-desktop-debug
```

The launcher uses the same discovery engine as diagnostics. It searches common install folders, ClickOnce-style local app folders, Start Menu shortcuts, Desktop and OneDrive Desktop shortcuts, Windows app aliases, `%LOCALAPPDATA%\Packages`, PATH command aliases, running process paths, AppX package entries, and uninstall registry entries. If more than one executable is found, it prints all candidates and launches the highest-ranked executable path.

If TradingView is installed in a custom location, set:

```powershell
$env:TRADINGVIEW_DESKTOP_EXE="C:\path\to\TradingView.exe"
npm.cmd run tradingview:start-desktop-debug
```

The launcher prints the exact command it starts and does not require admin rights.

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

Keep that terminal open while GoTrader checks status or fetches chart evidence.

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

## Diagnose, Stop, Or Restart A Stale Wrapper

If starting the wrapper prints `EADDRINUSE`, port `7331` is already occupied. The start script now probes
`http://127.0.0.1:7331/health` before failing:

- if a healthy GoTrader wrapper is already running, it prints the URL and exits successfully
- if the port is occupied by a stale wrapper or another process, it prints the PID/process details and next commands
- it does not dump a raw Node stack trace for normal stale-port recovery

Run the port diagnostic:

```powershell
npm.cmd run tradingview:mcp-diagnose-port
```

The diagnostic checks:

- whether port `7331` is free
- listener PID
- process name/path/command line when Windows exposes it
- `GET /health`
- `GET /status`
- `GET /candles?symbol=MNQ&timeframe=5m&limit=5`

It reports one of:

- `free`
- `healthy_gotrader_wrapper`
- `stale_gotrader_wrapper`
- `wrong_process`
- `occupied_unresponsive`

Stop a stale GoTrader wrapper:

```powershell
npm.cmd run tradingview:mcp-stop
```

The stop helper only stops listeners that look like a Node-based GoTrader TradingView MCP wrapper. If another unknown
process owns the port, it prints a warning and refuses to kill it by default. To override:

```powershell
$env:FORCE_STOP_TRADINGVIEW_MCP_BRIDGE="true"
npm.cmd run tradingview:mcp-stop
```

Restart the wrapper:

```powershell
$env:TRADINGVIEW_MCP_REPO_DIR="C:\Users\andre\tradingview-mcp"
npm.cmd run tradingview:mcp-restart
```

`tradingview:mcp-restart` stops a safe stale GoTrader wrapper if needed, then starts
`scripts/start-tradingview-mcp-bridge.mjs` in the current terminal. Keep that terminal open while using the bridge.

Full local sequence:

```powershell
npm.cmd run tradingview:diagnose
npm.cmd run tradingview:start-desktop-debug
$env:TRADINGVIEW_MCP_REPO_DIR="C:\Users\andre\tradingview-mcp"
npm.cmd run tradingview:mcp-bridge
```

Then in another terminal:

```powershell
npm.cmd run test:tradingview-mcp
```

Manual checks:

```powershell
Invoke-RestMethod http://127.0.0.1:7331/health
Invoke-RestMethod http://127.0.0.1:7331/status
Invoke-RestMethod "http://127.0.0.1:7331/evidence?symbol=MNQ&timeframe=5m"
Invoke-RestMethod "http://127.0.0.1:7331/quote?symbol=MNQ&timeframe=5m"
Invoke-RestMethod "http://127.0.0.1:7331/candles?symbol=MNQ&timeframe=5m&limit=5"
Invoke-RestMethod "http://127.0.0.1:7331/snapshot?symbol=MNQ&timeframe=5m&limit=5"
```

In the app:

1. Open `/settings`.
2. Find `TradingView MCP Evidence Bridge`.
3. Confirm URL is `http://127.0.0.1:7331`.
4. Enable local status checks.
5. Click `Check status`.
6. Click `Fetch chart evidence`.
7. Click `Fetch candles` or `Use as chart source` to render TradingView MCP candles in GoTrader Lightweight Charts.

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

## Candle Feed Shape

`GET /candles` returns a normalized read-only payload:

- provider: `tradingview_mcp`
- symbol/requested symbol and timeframe
- chart symbol/resolution when upstream status exposes them
- candles sorted oldest to newest
- first/last timestamp
- source command
- connection status: `connected_with_candles`, `connected_no_candles`, `disconnected`, or `error`
- warnings and missing evidence
- authority fields set to `none`

The current upstream CLI can return full bars with `ohlcv --count`. If that changes or a chart has no accessible bars,
GoTrader does not fake candles; it reports `connected_no_candles` and falls back to imported/mock/replay data.

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

If diagnostics still cannot find TradingView Desktop:

1. Right-click the TradingView shortcut in the Start Menu or on the Desktop.
2. Choose `Open file location`.
3. If Windows opens a shortcut folder, right-click the TradingView shortcut again and choose `Open file location`.
4. Copy the full path to `TradingView.exe`.
5. Set the override and rerun the launcher:

```powershell
$env:TRADINGVIEW_DESKTOP_EXE="C:\path\to\TradingView.exe"
npm.cmd run tradingview:start-desktop-debug
```

Then rerun:

```powershell
npm.cmd run tradingview:diagnose
```

If diagnostics shows a Windows Start App or AppX package candidate but no executable path, Windows may be hiding the Microsoft Store package path. The manual shortcut method above is still the safest way to get the real executable path for launching with `--remote-debugging-port=9222`.

If GoTrader Settings still shows disconnected:

- keep the wrapper terminal open
- check that the URL matches `http://127.0.0.1:7331`
- run `npm.cmd run tradingview:mcp-diagnose-port`
- if the port is stale, run `npm.cmd run tradingview:mcp-stop`, then restart the wrapper
- click `Check status` again

## Current Limits

The GoTrader wrapper currently uses read-only CLI commands:

- `status`
- `quote`
- `ohlcv --summary`
- `ohlcv --count`

It does not collect screenshots, indicator values, Pine drawing levels, or multi-pane evidence yet. Those can be added later as bounded evidence mappings, still with no execution authority.
