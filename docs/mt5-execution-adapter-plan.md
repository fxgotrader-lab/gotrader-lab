# MT5 Execution Adapter Plan

## Role

MT5 is the future forex/CFD/prop-firm execution adapter for GoTrader. It is not connected in Phase 1.

The app may model MT5 read-only market-data status, but it does not connect to MT5 MCP, REST, websocket quotes, or broker account state in this phase.

## Source Repo Findings

The inspected MetaTrader MCP repo supports MT5 account information, real-time symbol prices, historical candles, symbol metadata, order placement, position modification, pending orders, closing positions, history, REST API, MCP transports, and websocket quote streaming.

Because it includes direct order and position authority, it must remain behind GoTrader:

- Strategy Evaluator
- Risk Manager
- Broker Router
- Readiness Gate
- Journal/provenance system
- account mode gate

## Phase 1 Status

Implemented:

- MT5 route adapter result contract
- planned-disabled adapter status
- blocked dry-run intent helper
- no credential fields
- no MCP connection
- no REST connection
- no websocket quote connection
- read-only market-data status stub that reports disconnected
- no orders

## Future MT5 Flow

1. GoTrader produces StrategyCandidate.
2. Risk Manager approves only after all checks.
3. Broker Router routes forex/CFD symbols to MT5.
4. MT5 adapter requests broker quote/account readiness.
5. Dry-run/paper/live gate decides whether an intent is allowed.
6. Adapter submits order only in a future explicitly enabled phase.
7. ExecutionResult is journaled.

## Required Guardrails

- no MT5 credentials in frontend
- no MT5 credentials in journal records
- no raw broker responses in OpenClaw packets
- no order placement without RiskDecision approval
- no execution if readiness gate blocks
- no execution if account mode is research
- no execution if symbol route is unsupported

## Not Implemented

- MT5 MCP install
- MT5 connection test
- account info reads
- quote reads
- candle reads
- read-only subscription bridge
- order placement
- paper trading
- live trading
