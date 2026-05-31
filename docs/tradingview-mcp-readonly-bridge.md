# TradingView MCP Read-Only Evidence Bridge

## Purpose

TradingView MCP is an optional local chart-analysis source for GoTrader AI Lab. It is the eyes, not the brain or hands.

GoTrader remains responsible for:

- market-data source selection
- strategy evaluation
- risk decisions
- readiness gates
- broker routing
- journal/provenance
- safety locks

TradingView MCP may provide chart evidence such as visible chart state, OHLCV summaries, technical levels, indicators, patterns, screenshots, and advisory chart bias.

It must never provide:

- broker truth
- account state
- position state
- order status
- risk approval
- readiness approval
- execution authority

Reference repo: https://github.com/tradesdontlie/tradingview-mcp

## Local Bridge URL

Default local URL:

```text
http://127.0.0.1:7331
```

The URL is stored as non-secret local UI settings. No API keys or broker credentials are stored by this bridge configuration.

The upstream TradingView MCP project is MCP/CLI/CDP based, not this HTTP API directly. GoTrader provides an optional local wrapper script. See `docs/tradingview-mcp-local-setup.md`.

The bridge expects a local read-only HTTP wrapper around the TradingView MCP server. The app probes:

- `GET /health`
- `GET /status`
- `GET /`

For evidence it attempts:

- `POST /evidence`
- `GET /evidence?symbol=...&timeframe=...`

For read-only chart-feed preview it also supports:

- `GET /quote?symbol=...&timeframe=...`
- `GET /candles?symbol=...&timeframe=...&limit=...`
- `GET /snapshot?symbol=...&timeframe=...&limit=...`

If no bridge is running, GoTrader shows disconnected status and continues using imported/mock/replay chart sources.

## Read-Only Candle Feed

When the upstream CLI exposes full OHLCV bars through `ohlcv --count`, the GoTrader wrapper normalizes those bars into
the shared candle contract used by Lightweight Charts:

- timestamp
- open, high, low, close
- volume, when available
- source: `tradingview_mcp`
- authority fields set to `none`

This feed may be selected as a chart source in Market Data or Settings. It is labeled `TRADINGVIEW MCP` and
`read-only, not broker truth`. It is not a broker quote, not account truth, and not execution evidence.

If the upstream CLI only returns a summary on a given machine or chart state, `/candles` returns an empty candle array
with `connected_no_candles` and a `missingEvidence` explanation. GoTrader keeps using imported/mock/replay data.

## Command Center Auto-Refresh

Dashboard / Command Center can start a local auto-refresh loop for TradingView MCP chart data. The loop is read-only.
It checks the wrapper, fetches quote/candle data, stores candles in IndexedDB, and updates the active visual chart
source without requiring repeated Market Data clicks.

Supported intervals:

- 5 seconds, default
- 10 seconds
- 15 seconds

Supported candle limits:

- 100
- 240, default
- 400
- 1000

The loop state tracks:

- status: `idle`, `starting`, `running`, `paused`, `failed`, or `stopped`
- last refresh time
- next refresh time / countdown
- refresh count
- consecutive failures
- latest price
- latest candle timestamp
- candle count and storage backend

On full reload, the selected interval and candle limit are remembered, but the interval itself is not restarted
automatically. The user must start auto-refresh again from Command Center.

Failure behavior:

- If the wrapper is disconnected, GoTrader keeps the last visible candles and shows a reconnect message.
- If a candle fetch returns zero candles, GoTrader keeps the previous chart feed visible.
- After 3 consecutive failures, auto-refresh pauses and asks the user to restart the local wrapper.
- When the browser tab is hidden, the loop pauses refresh work and resumes on a later visible interval.

The Research Flow Tape receives compact auto-refresh events. Repeated success events are collapsed in the UI, and the
IndexedDB-backed communication audit remains best-effort so logging cannot block data activation.

## Research-Source Eligibility Gate

TradingView MCP candles are always treated as read-only chart data first. They may be displayed visually when the bridge
is connected and returns at least 5 valid candles. They may become a research source only after a separate eligibility
gate passes and the user explicitly selects `Use for research source`.

Eligibility states:

- `visual_only`
- `eligible_for_analysis`
- `eligible_for_research_cycle`
- `ineligible_symbol_mismatch`
- `ineligible_timeframe_mismatch`
- `ineligible_low_candle_count`
- `ineligible_disconnected`

Research-cycle eligibility requires all of the following:

- active GoTrader symbol matches the TradingView chart symbol or a known alias
- active GoTrader timeframe matches the TradingView chart resolution
- at least 400 normalized candles are available
- timestamps are monotonic
- source label explicitly says read-only and not broker truth
- the user selected TradingView MCP as the research source

Quick analysis can use 100+ candles, but readiness and research promotion still treat TradingView MCP as read-only
market data, not broker truth. Walk-forward validation still prefers larger imported historical windows.

## Evidence Contract

Normalized `TradingViewEvidence` includes:

- evidence id
- provider: `tradingview_mcp`
- connection status
- symbol and timeframe
- chart source
- visible range, if available
- latest price, if available
- OHLCV summary, if available
- detected levels
- indicators
- patterns
- chart bias
- confidence
- technical summary
- warnings
- missing evidence
- screenshot reference, if available
- timestamp
- authority fields set to `none`

If MCP output says `buy` or `sell`, GoTrader records it as advisory bias only and adds a warning. It does not become an order, strategy direction, risk approval, or readiness override.

## Data Source Distinction

TradingView MCP evidence is not the same as a live broker feed.

The current chart source remains one of:

- imported historical data
- mock data
- replay data
- TradingView MCP read-only chart feed
- future true live feed, only when a separate live-feed adapter reports connected status

The UI must not show a LIVE badge just because TradingView MCP evidence or candles are connected.

## UI Surfaces

Dashboard / Mission Control shows:

- TradingView MCP evidence available or disconnected
- latest evidence timestamp
- chart evidence bias
- authority: analysis only

Market Data shows:

- TradingView MCP as an analysis/evidence source
- not market-data truth
- not a broker feed
- not an execution source

Settings shows:

- local bridge URL
- enable local checks toggle
- status check
- chart evidence fetch
- execution authority: none
- broker authority: none
- readiness override: none

ICT Lab and Agent Debate can include stored TradingView evidence as supporting context. Deterministic GoTrader analysis remains primary.

LLM context packets include a compact TradingView evidence summary if stored evidence exists.

## Provenance

Status checks and evidence imports are recorded in the in-app communications audit as research notes. Stored records include:

- timestamp
- symbol/timeframe
- evidence id, if available
- authority: none
- warnings and missing evidence

Raw unrestricted MCP payloads are not persisted as broker truth or execution instructions.

## Safety

This bridge does not:

- place orders
- connect Tradovate
- execute through MT5
- create execution intents
- approve readiness
- override risk
- mark chart data as live
- expose frontend API keys

Broker execution remains disabled.

## Test Command

```powershell
npm.cmd run test:tradingview-mcp
```

If no local bridge is running, the command reports disconnected but exits successfully. This is expected for development machines without TradingView MCP active.

Start the optional wrapper:

```powershell
$env:TRADINGVIEW_MCP_REPO_DIR="C:\Users\andre\tradingview-mcp"
npm.cmd run tradingview:mcp-bridge
```
