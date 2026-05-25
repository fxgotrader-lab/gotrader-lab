# Self-Improvement Calibration Loop

GoTrader AI Lab can package OpenClaw/Hermes-style advisory recommendations into a local calibration proposal, test the proposal against deterministic mock data, compare it with the current baseline, and require user approval before active simulation settings change.

This workflow is simulation/research only. It does not add broker execution, order placement, readiness overrides, API keys, websocket feeds, Tradovate, TopStep, or live trading.

## How OpenClaw/Hermes Identifies Failures

Advisory agents may flag research weaknesses such as high drawdown, low win rate, weak average R, false positives, poor session performance, confidence calibration gaps, unstable agent weights, or overfitting risk.

AI Lab converts those findings into a `CalibrationProposal` with:

- a target problem
- a small proposed change
- expected improvement
- safety notes
- baseline metrics
- approval requirement

## How Proposals Are Tested

The self-improvement page runs a deterministic validation test with mock OHLC candles only. It compares the proposal with baseline validation metrics:

- total trades
- win rate
- average R
- max drawdown
- profit factor
- skipped signals
- estimated false positives
- confidence calibration
- readiness score
- stability score

The proposal is not accepted just because profit improves. It must improve stability or readiness without worsening sample quality.

## One Variable At A Time

The safest calibration flow changes one variable, or one small grouped set, at a time. Examples:

- raise confidence threshold only
- raise confluence and confidence together as a stricter evidence gate
- switch session filter only
- compare stop model only
- nudge agent weights only

Avoid mixing session, stop, thresholds, and agent weights in one proposal because it becomes impossible to know what actually helped.

## What Can Change

Allowed simulation calibration changes:

- confluence threshold
- confidence threshold
- session filter
- stop model
- target R multiple
- internal agent weights
- ICT scoring weights

## What Cannot Change

The proposal cannot:

- alter broker settings
- alter execution permissions
- override the readiness gate
- enable paper/demo trading
- enable live trading
- place orders
- control go-trader
- add broker API keys

## Approval Flow

1. Create a proposal.
2. Run the simulation test.
3. Review before/after metrics.
4. Confirm the comparison improves stability.
5. Approve or reject manually.
6. If approved, only local simulation calibration settings are updated.
7. Revert if the accepted calibration later proves unstable.

Execution authority stays separate from research authority at every step.
