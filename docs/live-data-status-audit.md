# Live Data Status Audit

## Summary

The app was not showing live chart data because the TradingView MCP and MT5 work added architecture contracts, authority boundaries, and planned adapter stubs, not a connected live market-data feed.

Lightweight Charts renders whatever candle source GoTrader gives it. It does not fetch market data. Today the chart source is one of:

- imported historical candles from IndexedDB
- mock candles
- replay candles

The live-data status layer makes that explicit in Runtime Snapshot, Dashboard/Mission Control, Market Data, Settings, and chart labels. A LIVE badge should only appear when a read-only feed reports `liveFeedAvailable = true`, `connectionStatus = connected`, and `dataMode = live_feed`.

TradingView MCP read-only evidence can now be connected separately through the local evidence bridge. That evidence does not change the chart source to live feed.

## Diagnostic Answers

### 1. Does TradingView MCP currently connect to a live data source?

No. The TradingView MCP code in GoTrader is currently an analysis-only/planned contract layer. It normalizes future chart evidence and strips execution authority, but it does not connect to a local TradingView MCP server or stream candles into the app.

### 2. Does MT5 adapter currently connect to MT5?

No. MT5 is locked behind planned broker adapter contracts. This phase adds a read-only market-data adapter stub with quote/candle methods that report disconnected status. It does not call MT5 MCP, REST, websocket, or any trading method.

### 3. Does any code currently subscribe to live candles or quotes?

No. There is no active websocket, polling subscription, MT5 MCP connection, TradingView MCP stream, Tradovate stream, or custom live-feed bridge feeding candles/quotes into chart state.

### 4. What chart data source is currently used?

Charts use GoTrader's prepared candle source and chart adapters:

- imported historical data when an IndexedDB dataset is active
- mock data when no imported dataset is active
- replay data in replay views

The shared Lightweight Charts component is only the renderer.

### 5. Does Runtime Snapshot support live_feed source?

Yes, after this change. `RuntimeMarketDataState` now includes `liveMarketDataStatus`, with provider, connection status, data mode, live availability, timestamps, available symbols, warnings, and explicit `executionAuthority: none` and `brokerAuthority: none`.

### 6. What is missing to show live chart data?

A connected read-only market-data bridge is still required. That bridge would need to:

- run server-side or locally outside the browser
- keep API keys and broker credentials out of frontend code
- normalize candles/quotes into GoTrader contracts
- expose only read-only candles/quotes to the frontend
- report connection health
- respect rate limits and caching
- keep all order/execution methods disabled

### 7. What is the safest next implementation?

The safest next step is a read-only local market-data bridge that uses an explicit provider such as Twelve Data, MT5 read-only quotes/candles, or a TradingView MCP chart-analysis stream. It should expose only normalized candles/quotes and status to GoTrader UI, with no order placement, no broker account mutation, and no readiness override.

## Implemented Status Model

Added:

- `LiveMarketDataStatus`
- `ReadOnlyMarketDataAdapterStatus`
- disconnected live-feed resolver for imported/mock/replay sources
- MT5 read-only market-data adapter stub
- TradingView MCP status stub
- Runtime Snapshot live-feed status
- Dashboard, Market Data, Settings status labels

The default status is disconnected:

- provider: `none`
- connectionStatus: `disconnected`
- dataMode: `mock`, `imported_historical`, or `replay`
- liveFeedAvailable: `false`
- executionAuthority: `none`
- brokerAuthority: `none`

## Safety Boundary

This status layer does not:

- place orders
- connect MT5
- connect Tradovate
- call TradingView MCP
- add websocket feeds
- expose API keys to the frontend
- enable live trading
- override readiness
- send a go-trader handoff

Broker execution remains disabled.
