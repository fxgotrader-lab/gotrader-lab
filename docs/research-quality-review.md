# Research Quality Review Workflow

GoTrader AI Lab uses the Research Quality workflow to turn validation results into a decision record for the ICT research strategy.

This remains simulation/backtesting only. No broker connection. No real trades.

## Run Validation First

The quality review depends on the latest Strategy Validation report stored in local browser storage.

1. Open `/validation`.
2. Run the validation suite.
3. Confirm the report contains scenario comparison, readiness score, calibration recommendations, and weak ICT rules.
4. Open `/research-quality`.
5. Run the quality review.

The quality review does not create new trades or call external systems. It only analyzes the stored validation report.

## What The Review Analyzes

The workflow evaluates:

- weakest ICT assumptions
- strongest ICT assumptions
- false-positive patterns
- drawdown clusters
- session performance
- long vs short performance
- confluence threshold sensitivity
- confidence threshold sensitivity
- agent contribution usefulness
- invalidation and target quality

## Readiness Grades

`Not Ready`

The strategy should remain in research. This grade means the validation evidence is weak, uneven, poorly calibrated, or too small to support broker-demo planning.

`Research Ready`

The strategy can continue through simulation refinement. This does not authorize broker-demo implementation. It means the current evidence is coherent enough to tune thresholds, review agents, and run broader mock-data tests.

`Paper-Demo Candidate`

The strategy has cleared the stricter simulated review gate. This still does not place trades and does not mean broker code should be added immediately. It means the next step can be architecture and risk-control review for a future single-account paper-demo bridge.

## Paper-Demo Gate

Do not proceed to broker demo unless readiness is `Paper-Demo Candidate`.

Before any paper-demo implementation, the following must be true:

- repeated validation runs show stable conservative results
- false-positive patterns are understood and reduced
- drawdown clusters are acceptable
- confidence calibration is reasonable
- session and direction filters are not fragile
- invalidation and target logic remain coherent across stop models
- broker-demo risk gates are specified separately
- manual controls and kill-switch behavior are documented

## Why This Is Simulation-Only

The quality review reads local validation JSON and produces local analysis. It does not:

- connect to brokers
- request live market data
- use websocket feeds
- store API keys
- send orders
- integrate Tradovate or TopStep
- support multi-account or copy-trading

The output is a research decision aid, not financial advice and not an execution instruction.
