# Broker Router Contracts

## Purpose

The broker router decides which future broker adapter would own a symbol after GoTrader strategy evaluation and Risk Manager approval. It does not execute orders.

Phase 1 adds route contracts and research-mode blockers only.

## Contracts

### BrokerRoute

`BrokerRoute` records:

- route id
- original symbol
- normalized symbol
- broker: `tradovate`, `mt5`, or `none`
- asset class
- account mode
- routing reason
- warnings
- execution authority
- broker authority

In research mode, execution and broker authority are always `none`.

### ExecutionIntent

`ExecutionIntent` records what would be sent to a broker later. In Phase 1 every intent is:

- `status = blocked`
- `orderType = none`
- `positionSize = null`
- `executionAuthority = none`

### ExecutionResult

`ExecutionResult` records the outcome. In Phase 1 every result is:

- `status = blocked`
- no order id
- no fill
- no raw broker response

### BrokerJournalEvent

`BrokerJournalEvent` records the route, evaluator decision, risk decision, blocked intent, blocked result, runtime fingerprint, and source references.

## Routing Table

Tradovate futures route:

- MNQ
- MES
- NQ
- ES
- YM
- MYM
- M2K

MT5 forex/CFD route:

- EURUSD / EUR/USD
- GBPUSD / GBP/USD
- USDJPY / USD/JPY
- XAUUSD / XAU/USD
- US30
- NAS100 / NASDAQ
- SPX500 / SPX

No execution route:

- crypto symbols in this phase
- unknown symbols

## Required Risk Controls

Future dry-run/paper/live phases must verify:

- max daily loss
- max trades per day
- max risk per trade
- position sizing
- spread check
- slippage check
- session filter
- news filter
- duplicate position check
- cooldown check
- account mode check
- broker route check
- readiness gate check

Risk Manager must remain mandatory.

## Future Phases

Phase 2: local dry-run router and quote/account readiness checks.

Phase 3: paper trading through approved Tradovate/MT5 adapters after readiness gates.

Phase 4: live execution only after explicit safety gate, credential isolation, audit trails, and manual approval.
