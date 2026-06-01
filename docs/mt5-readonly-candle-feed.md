# MT5 Read-Only Candle Feed

MT5 is a future read-only quote/candle provider behind GoTrader's Canonical Candle Source Manager. In this phase it is market data only. It does not execute, mutate orders, read or manage positions, expose credentials, approve risk, or override readiness.

## Current Status

Implemented now:

- MT5 read-only browser client and runtime state.
- Local endpoint contract at `http://127.0.0.1:7341`.
- Diagnostic/test scripts.
- Optional contract stub: `npm.cmd run mt5:readonly-bridge`.
- Canonical candle-source normalization for MT5 candles when a real read-only bridge returns data.
- Dashboard and Market Data controls for fetch, chart activation, and guarded research-source activation.

The included local wrapper is a contract stub. It returns `planned`/`disconnected` with empty candles until a real local MT5 read-only connector is provided.

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

All responses must include:

```json
{
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none"
}
```

The bridge must not expose buy, sell, close, modify, cancel, account mutation, position mutation, credentials, or broker handoff methods.

## Quote Shape

```json
{
  "provider": "mt5_read_only",
  "symbol": "MNQ",
  "brokerSymbol": "MNQ.z",
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

## Scripts

```powershell
npm.cmd run mt5:readonly-diagnose
npm.cmd run mt5:readonly-bridge
npm.cmd run test:mt5-readonly
```

`test:mt5-readonly` exits successfully when the bridge is disconnected or planned. It is a diagnostic, not a live-trading test.

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
