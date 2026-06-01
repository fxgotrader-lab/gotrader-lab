# MT5 Python Connection Troubleshooting

Use this guide when the upstream `ariadng/metatrader-mcp-server` OpenAPI server fails before GoTrader can connect through the safe read-only wrapper.

Common failure:

```text
Failed to initialize MetaTrader 5 terminal: IPC timeout (Error code: -10005)
```

This means the Python `MetaTrader5` package could not attach to a terminal process quickly enough. GoTrader should not start its upstream MT5 read-only path until this local Python connection is healthy.

## Diagnostic Command

From the GoTrader workspace:

```powershell
npm.cmd run diagnose:mt5-python
```

Or directly:

```powershell
python scripts/diagnose-mt5-python-connection.py
```

The diagnostic is read-only. It imports `MetaTrader5`, checks environment variables, initializes the terminal connection, optionally calls `mt5.login(...)`, and reads `terminal_info`, masked `account_info`, and `symbols_total`.

It does not place orders, inspect positions, mutate account state, or print your password.

## Required Local Environment

Set these in the shell where you run the diagnostic or upstream server:

```powershell
$env:LOGIN="YOUR_MT5_LOGIN"
$env:PASSWORD="YOUR_MT5_PASSWORD"
$env:SERVER="YOUR_MT5_SERVER"
```

If auto-detection fails, set the terminal executable path:

```powershell
$env:MT5_PATH="C:\Path\To\terminal64.exe"
```

Then rerun:

```powershell
npm.cmd run diagnose:mt5-python
```

## What The Diagnostic Prints

- Python version and architecture.
- `MetaTrader5` package import and version.
- Whether `LOGIN`, `PASSWORD`, `SERVER`, and `MT5_PATH` are present.
- Whether `MT5_PATH` exists.
- `mt5.initialize(...)` success/failure.
- `mt5.last_error()` code and message.
- `terminal_info`, if available.
- masked `account_info`, if available.
- `symbols_total`, if available.
- next-step recommendations based on the observed error.

## Fixing IPC Timeout `-10005`

Try these in order:

1. Open MetaTrader 5 Desktop manually.
2. Log in to the intended broker account inside MT5.
3. Keep MT5 open and unlocked.
4. Set `MT5_PATH` to the exact `terminal64.exe`.
5. Run the diagnostic from the same Windows user account.
6. Close duplicate/stale MT5 terminals and reopen the intended one.
7. Confirm your Python process is 64-bit.
8. Confirm the broker `SERVER`, `LOGIN`, and `PASSWORD` match the account shown in MT5.

If initialization succeeds but login fails, the issue is usually credentials/server selection rather than IPC.

## Starting Upstream After Diagnostic Passes

Only after the diagnostic can initialize and read terminal metadata, start the upstream OpenAPI server:

```powershell
cd C:\Users\andre\metatrader-mcp-server
python -m metatrader_openapi.main --login $env:LOGIN --password $env:PASSWORD --server $env:SERVER --host 127.0.0.1 --port 8000
```

If needed:

```powershell
python -m metatrader_openapi.main --login $env:LOGIN --password $env:PASSWORD --server $env:SERVER --path $env:MT5_PATH --host 127.0.0.1 --port 8000
```

Then start GoTrader's safe read-only wrapper in a separate shell:

```powershell
$env:MT5_READONLY_UPSTREAM_BASE_URL="http://127.0.0.1:8000"
npm.cmd run mt5:readonly-bridge
```

GoTrader frontend should use only:

```text
http://127.0.0.1:7341
```

Do not expose the upstream OpenAPI server directly to the frontend. The GoTrader wrapper blocks account, order, position, pending-order, history, and execution paths.

## Safety Boundary

The diagnostic and GoTrader MT5 wrapper are market-data/read-only tools only.

Not allowed in this phase:

- order placement
- position management
- account mutation
- Tradovate execution
- live trading controls
- readiness override
- go-trader handoff
