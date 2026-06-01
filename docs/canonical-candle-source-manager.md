# Canonical Candle Source Manager

GoTrader candle data now has a provider-neutral read model. Providers should not wire directly into charts, research cycles, walk-forward, or strategy code. They should normalize into a `CanonicalCandleSource` first.

## Providers

Supported or planned providers:

- `imported_historical`
- `tradingview_mcp`
- `mt5_read_only`
- `tradovate_read_only`
- `mock`
- `replay`

TradingView MCP is read-only chart data and evidence. MT5 read-only is a contract-backed local quote/candle provider that remains disconnected/planned until a local read-only MT5 bridge responds at `http://127.0.0.1:7341`. Neither has execution authority in this phase.

## Canonical Source Fields

Each source carries:

- `sourceId`
- `provider`
- `symbol`
- `normalizedSymbol`
- `timeframe`
- `candles`
- `candleCount`
- `firstTimestamp`
- `lastTimestamp`
- `firstClose`
- `lastClose`
- `storageBackend`
- `dataQuality`
- `eligibility`
- `eligibilityReasons`
- `warnings`
- `provenance`
- `authority`
- `fingerprint`

Authority is always:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

## Eligibility

The source manager applies common gates:

- Chart display: 5+ valid candles
- Quick analysis: 100+ valid candles
- Research cycle: 400+ valid candles, matching symbol/timeframe, explicit user selection
- Walk-forward: 1000+ valid candles preferred, explicit selection, and larger historical depth

No provider silently becomes the research source. TradingView MCP may be visual-only even when it is connected. Walk-forward should prefer imported historical depth until a future provider can prove sufficient history.

## Active Sources

The runtime snapshot exposes summaries for:

- `activeChartSource`
- `activeResearchSource`
- `activeWalkForwardSource`
- `allAvailableSources`

Summaries omit candle arrays so runtime diagnostics do not duplicate large OHLCV payloads.

## Current Integration

- Imported OHLCV registers as `imported_historical` and remains the preferred research/walk-forward source when active.
- TradingView MCP registers as `tradingview_mcp` when a read-only feed is loaded from IndexedDB/session cache.
- MT5 registers as `mt5_read_only` planned/disconnected by default, and as an available canonical source when a local read-only endpoint returns valid candles.
- Mock candles register as `mock` for demo/fallback only.

## Not Implemented

- MT5 execution
- Tradovate execution
- broker truth reconciliation
- live trading labels
- readiness override
- automatic broker handoff

Future phases can deepen local read-only MT5 or Tradovate candle endpoints by normalizing their output into `CanonicalCandleSource` and passing the same eligibility gates. Execution remains a separate, locked broker-adapter phase.
