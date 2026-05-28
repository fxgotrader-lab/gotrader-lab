# Market Data Adapter Roadmap

GoTrader AI Lab remains simulation-only. This roadmap defines the contracts and adapter boundaries needed for future real market context without adding live feeds, broker execution, API keys, websocket feeds, or order placement.

## Design Goal

Future real APIs should plug into adapter interfaces and produce a normalized `MarketContext`. Research agents consume the normalized context, not provider-specific payloads. That lets the agent logic remain stable while providers change behind the adapter boundary.

Current implementation:

- mode: `mock`
- source: mock candles and mock/planning context
- provider service: Twelve Data local/server-side service is available for forex, metals, crypto, and index/CFD research smoke tests
- agent bridge: normalized MarketSnapshot, ScannerOutput, StrategyCandidate, RiskDecision, and JournalEvent contracts are defined for the market-scanner flow
- market context service: FMP local/server-side service normalizes economic calendar, news, macro risk flags, and bounded context-only sentiment
- strategy/risk evaluator: combines MarketSnapshot, ScannerOutput, and MarketContextSnapshot into research-only StrategyCandidate, conservative RiskDecision, local JournalEvent, and bounded OpenClaw advisory packet
- local journal: optional JSONL persistence under `.gotrader/journal/` for rejected, no-trade, data-quality-failure, macro-risk-block, and research-only records
- broker execution: disabled
- live trading: disabled
- API keys in frontend: none

## Adapter Boundary

Each adapter must expose:

- `adapterId`
- `label`
- `mode`
- `status`
- `requiredSecrets`
- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`
- `loadContext({ symbol, timeframe })`

Secrets must never be committed or placed in browser code. Future authenticated providers should run through local command, backend endpoint, Supabase Edge Function, or another secure service boundary.

## Charting Boundary

GoTrader AI Lab uses TradingView Lightweight Charts as the shared renderer for Command Center, ICT Lab, Replay, Backtest Lab, and Market Data previews. Lightweight Charts renders normalized OHLCV and overlays only; it does not provide market data or broker connectivity.

Future live-feed work should plug into the market-data adapter boundary first, then feed normalized candles into the shared chart component. The placeholder live adapter remains labeled `future/live not connected` until a safe backend or local bridge exists.

## Data Contracts

### Price & Volume

The price/volume context covers:

- OHLCV by timeframe
- tick data placeholder
- VWAP
- anchored VWAP
- volume profile
- VPOC
- VAH
- VAL
- prior day high, low, close
- prior week high, low, close
- prior month high, low, close
- overnight high/low
- Globex range

Future provider path:

- CSV import first
- broker feed later
- Twelve Data local/server-side service for forex, metals, crypto, and index/CFD candles
- Polygon
- Alpaca
- Tradovate later

### Order Flow

Order-flow context is later/advanced only:

- DOM placeholder
- footprint placeholder
- delta
- cumulative delta
- large print detection

Future provider path:

- Bookmap export
- Sierra Chart export
- Quantower export
- offline file import before any live feed

### Positioning

Positioning context covers:

- COT
- put/call ratio
- gamma levels
- dealer gamma flip
- net positioning bias

Future provider path:

- CFTC weekly CSV for COT
- manual gamma import
- paid gamma provider later

### Macro & Economic

Macro context covers:

- economic calendar
- market news
- forex news
- crypto news
- stock/index news
- FOMC
- CPI
- NFP
- PPI
- retail sales
- Fed Funds futures implied path
- DXY
- VIX
- 2-year yield
- 10-year yield

Future provider path:

- FMP economic calendar and market news as the first provider implementation
- Trading Economics
- ForexFactory manual/CSV
- FXStreet
- Finnhub
- Alpha Vantage
- FRED macro series
- Stooq/Yahoo-style adapter for public market series

Provider output must be normalized into `EconomicCalendarEvent`, `MarketNewsItem`, `MacroRiskFlag`, `NewsSentimentSummary`, and `MarketContextSnapshot`. It cannot create trade direction or execution permission.

### Intermarket

Intermarket context covers:

- ES/NQ ratio
- YM/ES divergence
- bond futures context
- crude/gold risk context
- DXY/NQ relationship
- VIX/equity relationship

Future provider path:

- normalized cross-market candle adapters
- daily macro series cache
- no execution coupling

## Planned Market Data Agents

These agents replace the old equity-style sector layer for the main ES/NQ/MES/MNQ workflow. Sector rotation can still
be researched later as optional macro context, but the active futures research stack should focus on direct futures
inputs first.

### Session Levels Agent

Purpose: compare price to prior session, overnight, and Globex levels.

Input data:

- prior day/week/month high, low, close
- overnight high/low
- Globex high/low

Output: level proximity bias and invalidation context.

Execution authority: none.

### Auction/Volume Profile Agent

Purpose: review VWAP, anchored VWAP, VPOC, VAH, VAL, and value migration.

Output: auction location and acceptance/rejection notes.

Execution authority: none.

### Macro Event Risk Agent

Purpose: tag macro event risk and rate/volatility context.

Input data:

- economic calendar
- Fed Funds implied path
- DXY
- VIX
- 2-year yield
- 10-year yield

Output: event-risk warning and volatility posture.

Execution authority: none.

### Intermarket Confirmation Agent

Purpose: check whether related markets confirm or fight the thesis.

Input data:

- ES/NQ ratio
- YM/ES divergence
- bond futures
- crude/gold
- DXY/NQ
- VIX/equity

Output: confirmation, divergence, or neutral context.

Execution authority: none.

### Positioning/Gamma Agent

Purpose: summarize positioning and gamma levels.

Input data:

- COT
- put/call ratio
- gamma levels
- dealer gamma flip

Output: positioning bias and key level warnings.

Execution authority: none.

### Order Flow Agent

Purpose: later-stage review of DOM, footprint, delta, cumulative delta, and large prints.

Status: later/advanced.

Execution authority: none.

## LLM Context Integration

LLM context packets can include a compact `marketContextSummary`. This summary is advisory-only and uses normalized fields such as:

- available modules
- missing modules
- VWAP/VPOC/VAH/VAL
- overnight and Globex levels
- macro risk bias
- positioning bias
- order-flow status

LLM agents may interpret this context but cannot execute trades, approve readiness, modify risk settings, or control brokers.

## Strategy/Risk Context Evaluator

The Strategy/Risk Context Evaluator consumes normalized market data, scanner output, and market context. It is the provider-neutral gate that turns context into:

- flat/no-trade `StrategyCandidate`
- paper-mode `RiskDecision` with `approved=false`
- local journal-ready `JournalEvent`
- bounded OpenClaw advisory packet

It can reject for missing data, insufficient candles, zero latest close, raw provider payload inclusion, non-paper mode, and active high-impact macro event windows. It cannot create long/short direction, grant execution permission, or bypass the Risk Manager.

## Local Journal Boundary

The local journal stores compact `LocalJournalRecord` JSONL records for audit and replay. It is not a trading ledger and not a broker/account record. It never stores raw provider payloads, API keys, broker credentials, MT5 credentials, execution secrets, frontend session data, unbounded candle history, or approved executable decisions in this phase.

Future Supabase persistence should migrate from these sanitized contracts instead of raw provider payloads.

## Safety Rules

Market data adapters cannot:

- place orders
- connect to brokers for execution
- enable demo/live mode
- override readiness gates
- store API keys in the frontend
- use websocket feeds in this planning milestone
- change account/risk permissions

The market data layer is a research input layer only.
