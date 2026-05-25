# Paper/Demo Execution Plan

This plan models a future single-account paper/demo execution layer for GoTrader AI Lab and `go-trader`. It is planning and specification only. It does not implement broker APIs, live trading, Tradovate, TopStep, API keys, websocket feeds, order placement, multi-account routing, or copy-trading.

Current status: planning only.

## Responsibility Split

AI Lab owns research/thesis state:

- Research inputs, deterministic ICT context, internal agent opinions, CIO synthesis, prompt history, and local export audit records.
- Simulation handoff export and local performance memory.
- Imported performance feedback only after `go-trader` produces it.
- No broker connection and no order submission from the frontend.

go-trader owns execution state:

- Future scheduler risk gates.
- Future single-account paper execution request intake.
- Future order lifecycle and audit records.
- Future reconciliation between requested signals and broker-demo order status.

Broker demo account owns fills/positions:

- Demo order acceptance, rejection, fills, broker order IDs, open positions, account balance, and demo PnL.
- Broker-demo state remains outside AI Lab until a future paper-mode connector is intentionally implemented.

AI Lab receives performance feedback only:

- AI Lab may compare thesis quality, execution quality, and PnL feedback.
- Prompt improvement loops must distinguish simulated outcomes from paper/demo execution outcomes.

## Paper Execution Lifecycle

1. Handoff export
   - AI Lab exports a simulation-only handoff JSON file.
   - User saves it to the local exports folder.

2. Scheduler reads signal
   - `go-trader` reads the handoff with the AI Lab handoff reader.
   - Current scheduler mode remains simulation-only.

3. Risk gate checks
   - Future paper mode must check max daily loss, max contracts, symbol allowlist, session filter, stale handoff rejection, duplicate signal rejection, broker disconnect lockout, and kill-switch state.

4. Demo order request
   - Future only.
   - User approval is required before a paper order request leaves the bridge.

5. Broker demo fill
   - Future only.
   - Broker-demo adapter reports fill or rejection back to `go-trader`.

6. Position state update
   - `go-trader` reconciles paper fills, positions, open orders, and risk state.

7. PnL feedback
   - Demo PnL updates flow back to AI Lab as feedback data only.

8. AI Lab performance update
   - AI Lab stores feedback summaries and compares them against the original thesis.

## State Ownership

Research state:

- AI Lab owns thesis inputs, ICT facts, agent debate, CIO recommendation, prompt versions, and simulation export audit entries.

Execution state:

- `go-trader` owns paper request queues, order lifecycle state, risk-gate decisions, and execution reconciliation.

Broker position state:

- Broker demo account owns authoritative positions, fills, order IDs, and broker-side account values.

Audit state:

- `go-trader` owns execution audit logs.
- AI Lab stores imported summaries for research analytics only.

Manual override state:

- `go-trader` owns pause strategy, close position, flatten account, cancel pending orders, and disable bridge commands after explicit user approval.

## Manual Controls

Future paper/demo mode must expose:

- Pause strategy.
- Close position.
- Flatten account.
- Cancel pending orders.
- Disable bridge.

## Fail-Safes

Future paper/demo mode must enforce:

- Max daily loss.
- Max contracts.
- Symbol allowlist.
- Session filter.
- Stale handoff rejection.
- Duplicate signal rejection.
- Broker disconnect lockout.
- Emergency flatten.

## Future JSON Contracts

The TypeScript source of truth is `src/lib/integrations/paperDemoExecutionTypes.ts`.

Required future contracts:

- `PaperExecutionRequest`
- `PaperOrderStatus`
- `PaperFill`
- `PaperPosition`
- `PaperPnLUpdate`
- `PaperManualCloseRequest`
- `PaperFlattenAllRequest`
- `PaperBridgeHeartbeat`

## Explicit Non-Implementation Notes

- No broker code exists yet.
- This does not place trades.
- Demo execution comes after simulation bridge verification.
- AI Lab must remain a research frontend unless a future paper-mode approval and audit layer is intentionally added in `go-trader`.
