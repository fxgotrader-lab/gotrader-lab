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

- Dashboard Safe mode is for fast AI Research Cycles and may use only 500 raw candles, which can become about 100 processed 5m candles. That is not enough for meaningful walk-forward validation.
- Walk-forward Safe has its own data preset: latest 2,000 raw candles aggregated to 5m, normally about 400 processed candles, with up to 3 windows.
- Walk-forward Standard has its own data preset: latest 5,000 raw candles aggregated to 5m, normally about 1,000 processed candles, with up to 5 windows.
- Advanced mode allows more windows, but should be used carefully in the browser.

Each window runs the active resolved backtest configuration against all three splits.

If the page reports something like 101 processed candles, walk-forward is still using too small of a data window. Select Walk-forward Safe or Walk-forward Standard before judging strategy quality.

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

## Failure Diagnostics

When a walk-forward run fails, the app now stores a compact diagnostic summary instead of leaving a generic fail verdict. The diagnostic includes:

- Failed window count.
- Worst window ID.
- Worst out-of-sample win rate.
- Worst out-of-sample average R.
- Worst out-of-sample drawdown.
- Repeated failure reasons.
- A likely failure cause such as confidence calibration, low average R, session fragility, stop-model fragility, target-model fragility, sample size, overfit risk, or weak evidence quality.

## Targeted Follow-Up Search

Failed walk-forward diagnostics can create an Auto Research search plan labeled `walk_forward_failure_followup`. This plan does not run automatically and does not change the active baseline. It only prepares bounded candidate directions such as:

- Raising minimum confidence or applying evidence-quality confidence penalties when calibration is weak.
- Testing 1R / 1.5R / 2R targets and FVG or structure-based invalidation when average R is weak.
- Comparing sessions and long-only vs short-only when one out-of-sample window fails.
- Preferring simpler one-variable candidates when overfit risk is elevated.

Any later self-improvement proposal remains approval-required.

## Verdicts

Walk-forward verdicts are:

- `insufficient_evidence`
- `fail`
- `promising`
- `robust_research`
- `paper_demo_review_candidate`

`insufficient_evidence` means the app did not generate enough rolling windows or out-of-sample trades to judge strategy quality. It is not treated as overfit or strategy failure. The usual next step is to use Standard preset, increase max windows, increase the raw candle window, reduce the validation split if needed, or keep Quick search while increasing the data window.

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
