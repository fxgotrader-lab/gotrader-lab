# GoTrader AI Lab Strategy Validation Workflow

GoTrader AI Lab uses this workflow to validate ICT strategy assumptions before any broker-demo implementation is considered.

This is simulation validation only. No broker connection. No real trades.

## Purpose

The validation suite runs the existing mock-candle backtesting engine across controlled parameter scenarios. It is designed to answer whether the current ICT context engine, internal agents, CIO synthesis, and simulated trade assumptions are stable enough for more research.

It does not place orders, connect to brokers, request live data, open websockets, store API keys, or route anything to Tradovate, TopStep, or another execution venue.

## Scenarios

The `/validation` page runs ten deterministic mock-data scenarios:

1. Conservative confluence threshold
2. Aggressive confluence threshold
3. NY AM only
4. London only
5. Long-only
6. Short-only
7. Swing-stop model
8. Fixed-tick stop model
9. FVG invalidation model
10. High confidence only

Each scenario changes one validation assumption while keeping the rest of the simulation pipeline intact.

## Metrics

Each scenario records:

- total trades
- win rate
- average R
- max drawdown
- best trade
- worst trade
- skipped signals
- profit factor
- confidence calibration
- agent contribution summary

The report also stores the exact resolved backtest config used for each scenario so results can be reproduced against the same mock candle dataset.

## Calibration Report

The calibration layer identifies:

- strongest scenario
- weakest scenario
- best session
- worst session
- best bias direction
- worst bias direction
- recommended confluence threshold
- recommended confidence threshold
- agent weights to increase or decrease
- ICT rules that appear weak

The readiness score is red, yellow, or green. A green result requires conservative simulated evidence. Yellow and red results should be treated as not ready for broker-demo work.

## UI Workflow

1. Open GoTrader AI Lab.
2. Go to `/validation`.
3. Select **Run Validation Suite**.
4. Review the readiness card, scenario comparison table, calibration settings, agent weight guidance, and weak ICT rule signals.
5. Export the JSON report if you want a local audit artifact.
6. Check Settings for the latest validation timestamp, readiness status, and recommended next step.

## Broker-Demo Gate

The default status should remain:

`Not ready for broker demo`

Broker-demo planning should only advance after repeated simulated validation runs show stable conservative performance, acceptable drawdown, reasonable confidence calibration, and clear auditability.

Even after validation improves, the next step is still architecture review and paper-demo risk gate design, not live execution.
