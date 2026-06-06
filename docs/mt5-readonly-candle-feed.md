# MT5 Read-Only Candle Feed

MT5 is a future read-only quote/candle provider behind GoTrader's Canonical Candle Source Manager. In this phase it is market data only. It does not execute, mutate orders, read or manage positions, expose credentials, approve risk, or override readiness.

## Current Status

Implemented now:

- MT5 read-only browser client and runtime state.
- Local endpoint contract at `http://127.0.0.1:7341`.
- Diagnostic/test scripts.
- Optional contract stub: `MT5_READONLY_DISABLE_DEFAULT_UPSTREAM=true; npm.cmd run mt5:readonly-bridge`.
- MT5-first upstream REST market-data bridge via `MT5_READONLY_UPSTREAM_BASE_URL`.
- Safe upstream endpoint discovery across common REST market-data paths.
- Hard read-only tool policy with explicit account/order/position/history blocking.
- Canonical candle-source normalization for MT5 candles when a real read-only bridge returns data.
- Dashboard and Market Data controls for fetch, chart activation, and guarded research-source activation.

The included local wrapper defaults to proxying the local MT5 upstream at `http://127.0.0.1:8000`. It returns `degraded` with explicit upstream errors when that service is unavailable. Set `MT5_READONLY_DISABLE_DEFAULT_UPSTREAM=true` only when you intentionally want the safe contract-stub mode with empty candles.

## Upstream MCP Inspection

Reference inspected: `https://github.com/ariadng/metatrader-mcp-server`.

The upstream project exposes both MCP and HTTP surfaces. Its documented MCP transport options include:

- `stdio`
- `sse`
- `streamable-http`

It also includes a REST/OpenAPI server and quote WebSocket path. GoTrader does not expose any upstream MCP transport directly to the frontend.

Safe market-data tool families identified for this phase:

- `get_symbols`
- `get_symbol_price`
- `get_candles_latest`
- `get_candles_by_date`
- `get_symbol_info`
- status/health style checks

Blocked tool families identified:

- account: `get_account_info`
- execution: `place_market_order`, `place_pending_order`
- mutation: `modify_position`, `modify_pending_order`
- positions: `get_all_positions`, `get_positions_by_symbol`, `get_positions_by_id`, `close_position`, `close_all_positions`
- pending orders: `get_all_pending_orders`, `cancel_pending_order`, `cancel_all_pending_orders`
- history/account-adjacent: `get_deals`, `get_orders`

GoTrader treats even read-only account/order/position/history tools as out of scope for this phase. Only status, quote, candles/rates/OHLCV, symbol info, symbols, and spread are allowed.

## Endpoint Contract

Default bridge URL:

```text
http://127.0.0.1:7341
```

Expected read-only endpoints:

- `GET /health`
- `GET /status`
- `GET /quote?symbol=...`
- `GET /candles?symbol=...&timeframe=...&limit=...`
- `GET /snapshot?symbol=...&timeframe=...&limit=...`
- `GET /symbols`
- `GET /symbol-info?symbol=...`
- `GET /tool-policy?tool=...`

All responses must include:

```json
{
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none"
}
```

The bridge must not expose buy, sell, close, modify, cancel, account mutation, position mutation, credentials, or broker handoff methods.

## Optional Upstream HTTP Bridge

The local GoTrader wrapper can call a separate local MT5 REST/OpenAPI service only through safe market-data routes:

```powershell
$env:MT5_READONLY_UPSTREAM_BASE_URL="http://127.0.0.1:8000"
npm.cmd run mt5:readonly-bridge
```

For the default local desktop workflow, `npm.cmd run mt5:readonly-bridge` also uses `http://127.0.0.1:8000` when no upstream variable is set. The older alias `MT5_READONLY_UPSTREAM_URL` is accepted too. The wrapper will not expose arbitrary upstream tools; it only proxies safe market-data endpoints.

For the inspected `ariadng/metatrader-mcp-server` clone, install and start the upstream OpenAPI server locally outside the GoTrader frontend:

```powershell
cd C:\Users\andre\metatrader-mcp-server
python -m pip install -e .
$env:LOGIN="YOUR_MT5_LOGIN"
$env:PASSWORD="YOUR_MT5_PASSWORD"
$env:SERVER="YOUR_MT5_SERVER"
python -m metatrader_openapi.main --login $env:LOGIN --password $env:PASSWORD --server $env:SERVER --host 127.0.0.1 --port 8000
```

If your MT5 terminal is not auto-detected, add the terminal path locally:

```powershell
$env:MT5_PATH="C:\Path\To\terminal64.exe"
python -m metatrader_openapi.main --login $env:LOGIN --password $env:PASSWORD --server $env:SERVER --path $env:MT5_PATH --host 127.0.0.1 --port 8000
```

Do not expose this upstream server directly to the browser UI. GoTrader should talk to `http://127.0.0.1:7341`, and the 7341 wrapper should be the only component that calls the upstream market-data routes.

Default upstream paths:

- quote: `/api/v1/market/price`
- candles: `/api/v1/market/candles/latest`
- symbols: `/api/v1/market/symbols`
- symbol info: `/api/v1/market/symbol/info/{symbol_name}`
- status probe: `/api/v1/market/symbols`

Discovery candidates:

- status: `/health`, `/status`, `/api/v1/market/symbols`, `/symbols`
- quote: `/quote`, `/price`, `/tick`, `/api/v1/market/price`
- candles: `/candles`, `/rates`, `/ohlcv`, `/api/v1/market/candles/latest`
- candle range: `/api/v1/market/candles/range`, `/api/v1/market/candles/by-date`, `/api/v1/market/candles`, `/candles/range`, `/candles/by-date`, `/candles`
- symbols: `/symbols`, `/api/v1/market/symbols`
- symbol info: `/symbol-info`, `/symbol_info`, `/api/v1/market/symbol/info/{symbol_name}`

Override these only for a compatible local read-only server:

```powershell
$env:MT5_READONLY_UPSTREAM_QUOTE_PATH="/api/v1/market/price"
$env:MT5_READONLY_UPSTREAM_CANDLES_PATH="/api/v1/market/candles/latest"
$env:MT5_READONLY_UPSTREAM_CANDLES_RANGE_PATH="/api/v1/market/candles/range"
$env:MT5_READONLY_DEFAULT_SYMBOL="NAS100"
```

Broker-symbol overrides are intentionally separate from the GoTrader requested symbol:

```powershell
$env:MT5_READONLY_REQUESTED_SYMBOL="MNQ"
$env:MT5_READONLY_DEFAULT_SYMBOL="USTECH"
$env:MT5_READONLY_BROKER_SYMBOL="USTECH"
npm.cmd run test:mt5-readonly
```

`requestedSymbol` is GoTrader provenance. `symbol` is the MT5 broker symbol sent upstream. For example, `MNQ` can request MT5 broker proxy data such as `USTECH`, but that data must be labeled as read-only CFD/proxy data and not CME MNQ futures broker truth.

The wrapper has no arbitrary MCP tool-call endpoint. Unknown tools are not forwarded. Account, order, position, pending-order, and history paths are explicitly rejected.

Supported upstream transport setting:

```powershell
$env:MT5_READONLY_UPSTREAM_TRANSPORT="rest"
```

REST is the default and only implemented upstream transport for this phase. MCP `stdio`, `sse`, and `streamable-http` remain documented upstream capabilities, but GoTrader does not expose or call them directly from the frontend.

The inspected `ariadng/metatrader-mcp-server` OpenAPI router expects latest candles as:

```text
GET /api/v1/market/candles/latest?symbol_name=EURUSD&timeframe=M5&count=400
```

GoTrader maps app timeframes such as `5m` to MT5 values such as `M5` before calling that upstream route. Symbol info is path-based:

```text
GET /api/v1/market/symbol/info/EURUSD
```

The current upstream may not implement a date-range HTTP route. If `npm.cmd run test:mt5-readonly-depth` reports latest candles as live but `rangeEndpointAvailable=false`, the required upstream addition is a read-only endpoint such as:

```text
GET /api/v1/market/candles/range?symbol_name=USTECH&timeframe=M5&date_from=2026-03-01T00:00:00.000Z&date_to=2026-03-11T00:00:00.000Z&count=5000
```

The response should be an array or object containing `candles`, `rates`, `data`, or `items`; each item must include OHLC values and a timestamp/time field. It must not expose account, order, position, deal/history, credential, or execution operations.

## Quote Shape

```json
{
  "provider": "mt5_read_only",
  "symbol": "NAS100",
  "requestedSymbol": "MNQ",
  "brokerSymbol": "NAS100",
  "bid": 19000.25,
  "ask": 19000.5,
  "mid": 19000.375,
  "spread": 0.25,
  "timestamp": "2026-06-01T14:30:00.000Z",
  "connectionStatus": "connected",
  "warnings": [],
  "missingEvidence": [],
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none"
}
```

## Candle Shape

```json
{
  "provider": "mt5_read_only",
  "symbol": "MNQ.z",
  "requestedSymbol": "MNQ",
  "brokerSymbol": "MNQ.z",
  "timeframe": "5m",
  "requestedTimeframe": "5m",
  "requestedLimit": 400,
  "returnedCount": 400,
  "candles": [
    {
      "time": 1780324200,
      "timestamp": "2026-06-01T14:30:00.000Z",
      "open": 19000,
      "high": 19010,
      "low": 18995,
      "close": 19005,
      "volume": 120,
      "tickVolume": 120,
      "spread": 0.25
    }
  ],
  "connectionStatus": "connected",
  "depthStatus": "full",
  "warnings": [],
  "missingEvidence": [],
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none"
}
```

## Canonical Source Integration

When MT5 candles are returned, GoTrader stores the full candle array in IndexedDB and stores only compact feed metadata in localStorage. The feed becomes a `CanonicalCandleSource` with provider `mt5_read_only`.

Eligibility gates:

- Chart display: 5+ valid candles.
- Quick analysis: 100+ valid candles.
- Research cycle: 400+ valid candles, matching symbol/timeframe, explicit user selection.
- Walk-forward: 1000+ valid candles preferred; otherwise blocked with a depth warning.

MT5 never silently becomes the research source. The user must explicitly choose "Use MT5 for Research" and the source must pass the gate.

## Symbol Mapping

MT5 broker symbols often differ from GoTrader/TradingView symbols. GoTrader supports aliases and a broker-symbol override.

Examples:

- `MNQ`: `MNQ`, `MNQ.z`, `MNQm`, `Micro Nasdaq`
- `NQ`: `NQ`, `NAS100`, `US100`, `USTEC`
- `ES`: `ES`, `SPX500`, `US500`
- `YM`: `YM`, `US30`, `DJ30`
- `XAUUSD`: `XAUUSD`, `GOLD`
- `EURUSD`: `EURUSD`, `EUR/USD`

Use the broker-symbol override when your MT5 broker uses custom suffixes.

## Timeframe Mapping

GoTrader maps common app timeframes into MT5-style values when calling the upstream adapter:

- `1m` -> `M1`
- `5m` -> `M5`
- `15m` -> `M15`
- `30m` -> `M30`
- `1h` -> `H1`
- `4h` -> `H4`
- `1d` -> `D1`

## Scripts

```powershell
npm.cmd run mt5:readonly-diagnose
npm.cmd run mt5:readonly-bridge
npm.cmd run test:mt5-readonly
npm.cmd run test:mt5-readonly-safety
```

`test:mt5-readonly` exits successfully when the bridge is disconnected or planned. It is a diagnostic, not a live-trading test.

`test:mt5-readonly-safety` proves GoTrader's allowlist rejects execution/account/order/position tool families. It can run with or without the local wrapper.

## Safety Boundary

Not implemented:

- MT5 order execution
- account login or credential storage
- broker connection controls
- position management
- account mutation
- live trading labels
- readiness override
- go-trader handoff

MT5 read-only data can support chart display and research only after it passes Canonical Candle Source Manager eligibility.
