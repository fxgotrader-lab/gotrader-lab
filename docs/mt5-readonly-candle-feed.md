# MT5 Read-Only Candle Feed Plan

MT5 may become a read-only quote/candle provider for GoTrader research. In this phase it is only a planned adapter stub. It does not connect to MT5, place orders, read positions, or expose broker authority.

## Phase Scope

Implemented now:

- `getStatus()`
- `getQuote(symbol)`
- `getCandles(symbol, timeframe, limit)`
- `getSymbolInfo(symbol)`
- canonical source normalization for planned/disconnected state

All methods return planned/disconnected status unless a future local read-only endpoint is explicitly configured.

## Authority

MT5 read-only adapter authority is always:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

No execution methods are exposed in `src/lib/integrations/mt5`.

## Future Local Endpoint Shape

A future local-only bridge can expose:

- `GET /status`
- `GET /quote?symbol=...`
- `GET /candles?symbol=...&timeframe=...&limit=...`
- `GET /symbol-info?symbol=...`

Responses should include only quotes/candles/symbol metadata. They must not include credentials, account state, positions, order history, order placement methods, or broker secrets.

## Source Manager Integration

When connected, MT5 candles must normalize into `CanonicalCandleSource` with provider `mt5_read_only`. The Canonical Candle Source Manager then decides whether the source is eligible for chart display, quick analysis, research cycle, or walk-forward.

MT5 read-only data is not broker truth for fills or execution. Broker/account truth remains future work behind explicit safety gates.

## Safety Boundary

Not implemented:

- MT5 order execution
- account login flows
- broker connection UI
- live trading controls
- go-trader handoff
- readiness override

The adapter exists to prepare a safe quote/candle path only.
