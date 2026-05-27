# Shared Lightweight Charting Engine

GoTrader AI Lab now uses TradingView Lightweight Charts as the shared chart renderer for research views. The renderer is UI-only: it displays historical, mock, or replay candles and overlays. It does not provide market data, websocket feeds, broker connectivity, or execution.

## What Was Added

- `TradingChart` is the reusable React chart shell.
- `ChartToolbar` shows source labels, candle counts, timeframe, and overlay toggles.
- `ChartOverlays` shows a compact overlay legend.
- `chartTheme` defines the dark mission-control chart style.
- `chartDataAdapters` and `seriesAdapters` normalize candles, overlays, and markers for Lightweight Charts v5.

Every chart keeps the TradingView attribution logo enabled through `layout.attributionLogo: true`.

## Supported Sources

The chart layer supports four source types:

- `mock`: local mock research candles.
- `imported`: local historical OHLCV imports from CSV/XLSX.
- `replay`: candle-by-candle simulation replay.
- `live_placeholder`: future live adapter placeholder only.

Only the first three are usable today. `live_placeholder` exists so future live feed work can plug into the same boundary without changing agent or chart logic.

## Supported Series and Annotations

Current support:

- candlestick series
- VWAP line overlay
- liquidity level lines
- premium/discount range lines
- FVG zone boundary lines
- entry, invalidation, and target lines
- MSS, BOS, sweep, entry, and current-candle markers

Planned support:

- anchored VWAP
- richer volume profile overlays
- session high/low bands
- prior day/week/month levels
- future live-feed status overlays

## Pages Using the Shared Chart

- Dashboard Command Center: compact active-source price chart.
- ICT Lab: active data source with ICT overlays and markers.
- Replay Lab: revealed replay candles with replay markers and trade-plan levels.
- Backtest Lab: active candle preview using the backtest candle source.
- Market Data: prepared research-window preview.

## Data Boundary

Lightweight Charts is the rendering engine only. Candle data still comes from GoTrader AI Lab adapters:

- imported historical files through IndexedDB
- mock candle fixtures
- replay windows from the backtest engine
- future provider adapters later

Future live providers must pass through adapter contracts and must not add API keys or broker authority to the frontend.

## Safety

Charts cannot:

- execute trades
- enable paper/demo/live trading
- connect to Tradovate
- open websocket feeds
- place orders
- override readiness gates

The charting engine is research visualization only.
