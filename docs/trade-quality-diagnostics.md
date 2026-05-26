# Trade Quality Diagnostics

GoTrader AI Lab separates two research failures:

- **No trades generated:** the strategy cannot be evaluated yet.
- **Trades generated, weak quality:** the strategy can be evaluated, but the trade plan needs calibration.

This workflow is simulation-only. It cannot execute trades, enable demo/live mode, connect to a broker, or override readiness gates.

## What It Checks

Trade quality diagnostics review completed simulated backtests for:

- win rate too low
- average R too low
- max drawdown too high
- sample size too low
- weak session behavior
- weak long/short bias
- weak stop model behavior
- target R mismatch
- too many low-R trades
- false-positive clusters
- unstable conservative scenarios

Each diagnostic returns a reason code, current value, required value, severity, explanation, suggested fix, and candidate configuration hints.

## Optimizer Candidates

When trades exist but quality is weak, Auto Research can test bounded research-only candidates:

- stop model tests: fixed tick, latest swing, FVG invalidation, structure-based invalidation
- target tests: 1R, 1.5R, 2R, nearby liquidity target proxy
- session tests: NY AM only, London only, all sessions, exclude weak session
- direction tests: long-only, short-only, both directions
- quality filters: higher confidence, higher confluence, avoid low-R setups

The optimizer prefers stability and average R over profit factor alone. It must not create a proposal if win rate, average R, or sample size collapses.

## How To Use It

1. Import or select historical data.
2. Run an AI Research Cycle from the dashboard.
3. Review the Trade Quality Diagnostics summary.
4. Open Auto Research for tested stop, target, session, and direction variants.
5. Open Self-Improvement only if a proposal is created.
6. Approve only research calibrations that preserve sample size, win rate, average R, and readiness evidence.
7. Rerun validation after approval.

## Safety Boundary

Trade quality optimization changes simulation settings only. It cannot change broker settings, enable paper/demo/live trading, approve readiness, or place orders.
