# Tradovate Execution Adapter Plan

## Role

Tradovate is the future futures execution adapter for GoTrader. It is not connected in Phase 1.

## Supported Future Symbols

The route contract maps futures symbols to Tradovate:

- MNQ
- MES
- NQ
- ES
- YM
- MYM
- M2K

## Phase 1 Status

Implemented:

- Tradovate route adapter result contract
- planned-disabled adapter status
- blocked dry-run intent helper
- no credential fields
- no API connection
- no websocket feed
- no order placement

## Future Tradovate Flow

1. GoTrader market data and TradingView evidence are evaluated.
2. StrategyCandidate is produced.
3. Risk Manager must approve.
4. Broker Router maps futures to Tradovate.
5. Tradovate adapter requests quote/account readiness in a later phase.
6. Dry-run or paper intent can be created only after the explicit mode gate.
7. ExecutionResult is journaled.

## Required Guardrails

- no Tradovate credentials in frontend
- no Tradovate credentials in journal records
- no raw broker responses in OpenClaw packets
- no order placement without RiskDecision approval
- no readiness override
- no execution if account mode is research
- no execution if risk limits fail

## Not Implemented

- Tradovate credentials
- Tradovate REST client
- Tradovate websocket client
- quote/account readiness checks
- order placement
- paper trading
- live trading
