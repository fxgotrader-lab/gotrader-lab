# Broker Demo Bridge Architecture Spec

GoTrader AI Lab is a local-first research cockpit. This document defines a future bridge to single-account broker-demo paper execution through `go-trader`, but it does not implement broker connectivity, API keys, websocket feeds, order placement, Tradovate, TopStep, live trading, or copy-trading.

Current status: planning only.

## Responsibility Split

AI Lab owns research state:

- Trade thesis inputs and outputs.
- ICT context, confluence scoring, internal agent debate, and CIO synthesis.
- Simulation exports and local user approval records.
- Prompt versions, prompt mutations, and research performance analytics.
- Backtest and replay configuration using mock OHLC candles only.

go-trader owns execution state:

- Future paper execution request intake.
- Future order lifecycle state for demo accounts.
- Future reconciliation between requested signals and broker-demo order status.
- Future execution audit log and paper PnL feedback transport.

Broker owns actual fills and positions:

- Demo account order acceptance or rejection.
- Demo fill messages.
- Demo open position state.
- Demo realized and unrealized PnL.
- Demo account risk status.

## Signal Lifecycle

1. AI Lab thesis
   - Research Workbench, Replay, or Backtest Lab generates a `TradeThesis`.
   - Thesis remains local and simulation-only.

2. Simulation export
   - User explicitly confirms export.
   - AI Lab produces a go-trader-compatible simulation signal.

3. go-trader-compatible signal
   - Signal preserves `strategy`, `symbol`, `timeframe`, `signal`, `confidence`, `entry_zone`, `invalidation`, `target`, `risk_notes`, and `mode`.
   - Current mode remains `"simulation"`.

4. Paper execution request
   - Future only.
   - User must approve a paper execution request after reviewing signal, risk gates, and account mode.

5. Broker-demo order
   - Future only.
   - go-trader would translate a paper execution request into a broker-demo order.
   - AI Lab must never submit broker orders directly.

6. Fill confirmation
   - Future only.
   - Broker-demo fill events flow to go-trader, then back to AI Lab as execution feedback.

7. PnL feedback
   - Future only.
   - Demo PnL updates are treated as execution feedback, separate from research scoring.

8. Performance update
   - AI Lab may compare original thesis quality, paper execution quality, and resulting PnL.
   - Prompt improvement loops must distinguish simulated outcomes from demo execution feedback.

## Required Future JSON Contracts

The TypeScript source of truth is `src/lib/integrations/brokerDemoBridgeTypes.ts`.

### GoTraderSignal

Extends the current simulation export shape and keeps explicit mode information:

```json
{
  "strategy": "ict_ai_lab",
  "source": "gotrader_ai_lab",
  "symbol": "NQ",
  "timeframe": "5m",
  "signal": 1,
  "confidence": 0.72,
  "entry_zone": [18864, 18880],
  "invalidation": 18836,
  "target": 18952,
  "risk_notes": "Research-only notes.",
  "mode": "simulation",
  "timestamp": "2026-05-24T00:00:00.000Z"
}
```

### DemoExecutionRequest

Future paper execution request. Requires explicit user approval and paper-mode locks.

```json
{
  "id": "demo_exec_001",
  "signal_id": "signal_001",
  "requested_at": "2026-05-24T00:00:00.000Z",
  "mode": "paper",
  "approved_by_user": true,
  "quantity": 1,
  "order_type": "limit",
  "time_in_force": "day"
}
```

### DemoOrderStatus

Tracks accepted, rejected, working, filled, cancelled, or failed demo order state.

### DemoFill

Represents a broker-demo fill confirmation with fill price, quantity, side, and timestamp.

### DemoPosition

Represents a single-account demo position for symbol, side, quantity, average price, and unrealized PnL.

### DemoPnL

Represents realized PnL, unrealized PnL, fees, drawdown, daily PnL, and total PnL for paper execution analytics.

### ManualCloseRequest

Future user-approved request to close one demo position.

### FlattenAllRequest

Future user-approved emergency request to flatten all demo positions and pause strategy automation.

## Safety Controls

The future bridge must enforce all of these gates before any demo execution request can leave AI Lab:

- Simulation mode lock remains the default app state.
- Paper mode lock must be explicit and visible.
- User approval is required before any demo execution request.
- Kill switch blocks all paper execution requests.
- Max daily loss blocks new requests and can trigger flatten planning.
- Max contracts prevents oversized paper positions.
- Session filter blocks requests outside allowed sessions or kill zones.
- Symbol allowlist prevents unsupported symbols.
- Broker credentials must never be stored in AI Lab local storage.
- AI Lab must not connect directly to broker APIs.

## Future UI Requirements

Performance tab:

- Demo PnL.
- Open positions.
- Order history.
- Execution audit log.
- Research vs execution attribution.

Controls:

- Close trade button.
- Flatten all button.
- Pause strategy button.
- Kill switch status.
- Paper mode indicator.
- Explicit approval modal for every paper execution request.

Settings:

- Broker Demo Bridge status.
- Paper mode lock.
- Symbol allowlist.
- Max contracts.
- Max daily loss.
- Session filter.
- Kill switch.

## Non-Goals

- No live trading.
- No broker API connection.
- No Tradovate implementation.
- No TopStep implementation.
- No websocket feed.
- No API keys.
- No order placement.
- No multi-account routing.
- No copy-trading.

## Current Prototype State

The current app only contains:

- TypeScript contract definitions.
- A static bridge architecture spec.
- A Settings card that says the bridge is not connected and planning-only.

There is no executable broker-demo bridge.
