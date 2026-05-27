# Walk-Forward Validation

GoTrader AI Lab now has a simulation-only walk-forward validation layer for imported OHLCV data. The goal is to test whether an active calibration survives more than one selected candle window.

## What It Tests

Walk-forward validation splits historical candles into:

- In-sample: the window where the current calibration is observed.
- Validation: the first holdout check.
- Out-of-sample: the most important check, used to detect overfit behavior.

Supported split ratios:

- 60 / 20 / 20 by default.
- 70 / 15 / 15.
- 50 / 25 / 25.
- Custom advanced ratios from the UI.

## Rolling Windows

The orchestrator creates rolling windows from the active prepared candle source:

- Safe mode uses small windows and fewer passes.
- Standard mode uses more candles and more rolling windows.
- Advanced mode allows more windows, but should be used carefully in the browser.

Each window runs the active resolved backtest configuration against all three splits.

## Metrics Collected

Each split records compact metrics only:

- Trades.
- Win rate.
- Average R.
- Max drawdown.
- Profit factor.
- False positives.
- Confidence calibration.
- Readiness score.
- Evidence quality score.
- Pass/fail reasons.

Raw candles are not written to localStorage.

## Stability Analysis

The stability analyzer compares all out-of-sample windows. It considers:

- Average and median win rate.
- Worst-window win rate.
- Worst-window average R.
- Worst-window drawdown.
- Trade count consistency.
- False-positive consistency.
- Readiness consistency.
- Overfit risk.

One good window is never enough. Worst-window behavior and out-of-sample behavior matter more than in-sample performance.

## Verdicts

Walk-forward verdicts are:

- `fail`
- `promising`
- `robust_research`
- `paper_demo_review_candidate`

These verdicts do not approve broker/demo/live trading. They only increase or reduce research confidence.

## Proposal Gate

Self-improvement proposals now show whether the latest proposal has walk-forward validation. A proposal based on one selected window should be treated as preliminary until it passes out-of-sample checks.

## Readiness And Maturity

The Dashboard, Readiness Gate, Research Maturity, and Self-Improvement pages read the latest compact walk-forward result through the canonical runtime snapshot.

If no walk-forward validation exists, readiness and maturity show a warning that selected-window evidence is not enough for high confidence.

## Safety Boundary

Walk-forward validation is simulation-only:

- It cannot execute trades.
- It cannot enable paper/demo/live mode.
- It cannot modify broker settings.
- It cannot override readiness gates.
- It cannot approve its own calibration proposals.
