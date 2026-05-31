# Multi-Broker Architecture

## Executive Summary

Phase 1 adds contracts and safety policies for a future multi-broker GoTrader architecture. It does not connect brokers, place orders, create live credentials, or enable paper/live execution.

It also does not create a live chart-data feed. Lightweight Charts renders GoTrader candle sources, and the current app sources are imported historical, mock, or replay candles unless a separate read-only feed reports connected status.

The intended responsibility split is:

- TradingView MCP is the eyes: chart analysis, levels, indicators, replay context, screenshots, and technical confirmation.
- GoTrader is the brain: strategy evaluation, risk checks, broker routing, readiness gates, provenance, and journal records.
- Tradovate and MT5 are the hands: future execution adapters only.

TradingView MCP must never be treated as broker truth or execution authority. Broker quotes, account state, fills, margin, and order status must come from the broker adapter in a later phase.

## Repository Inspection Summary

TradingView MCP (`tradesdontlie/tradingview-mcp`) provides MCP and CLI access to TradingView Desktop through Chrome DevTools Protocol. Its scope includes chart navigation, current quotes, OHLCV summaries, indicator values, Pine tooling, drawing, alerts, replay, screenshots, and JSONL streaming from a local chart. It is suitable as an analysis/evidence adapter, not an execution adapter.

MetaTrader MCP (`ariadng/metatrader-mcp-server`) provides MT5 account, quote, candle, position, order, REST, MCP, and websocket quote capabilities. It includes order placement and position management, so GoTrader must wrap it behind Risk Manager, broker router, credential isolation, and explicit execution gates before any use.

## Phase 1 Implementation

Added:

- TradingView MCP analysis-only evidence contracts.
- TradingView authority normalization that downgrades buy/sell and any authority claims.
- Broker route contracts for futures, forex, CFDs, crypto, and unknown symbols.
- Tradovate planned futures adapter stubs.
- MT5 planned forex/CFD adapter stubs.
- Research-mode execution intent/result blockers.
- Broker journal event contract for blocked intents and future provenance.
- Settings and Command Center planned/locked status indicators.
- Live market-data status fields that explicitly show TradingView MCP and MT5 are not connected live feeds in this phase.

## Routing Rules

Futures route to Tradovate:

- MNQ, MES, NQ, ES, YM, MYM, M2K

Forex/CFD symbols route to MT5:

- EURUSD, EUR/USD, GBPUSD, GBP/USD, USDJPY, USD/JPY
- XAUUSD, XAU/USD
- US30, NAS100, NASDAQ, SPX500, SPX

Crypto symbols remain research-only with no execution route in this architecture phase.

Unsupported symbols route to `none`.

## Authority Rules

Default account mode is `research`.

In research mode:

- `executionAuthority = none`
- `brokerAuthority = none`
- every `ExecutionIntent` is `blocked`
- every `ExecutionResult` is `blocked`
- no broker API or MCP execution call is allowed

Future modes are documented only:

- `dry_run`: simulated intent only
- `paper`: explicit safety gate required
- `live`: explicit safety gate required

## Required Decision Chain

All future execution must pass through:

1. Market snapshot
2. TradingView evidence, if available
3. Strategy candidate
4. GoTrader evaluator decision
5. Risk Manager decision
6. Broker route
7. Execution intent
8. Broker adapter
9. Execution result
10. Journal/provenance record

Risk Manager is mandatory. Execution adapters must never bypass it.

## What Remains Locked

- Tradovate credentials
- MT5 credentials
- broker quote/account checks
- MT5 read-only quote/candle bridge
- TradingView MCP live chart feed bridge
- order placement
- dry-run execution
- paper trading
- live trading
- readiness overrides
- go-trader handoff automation

## Next Phase

Phase 2 should add a local dry-run broker router that simulates route decisions and quote/account readiness checks without calling real brokers. It should still keep execution blocked unless an explicit dry-run mode is enabled and journaled.
