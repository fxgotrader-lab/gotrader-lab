# Backtest Calibration Guide

GoTrader AI Lab backtest calibration is simulation-only. Do not connect broker execution until readiness is repeatedly Paper-Demo Candidate under conservative settings.

## What The Calibration Assistant Does

The Backtest Lab Calibration Assistant explains why readiness may fail and suggests the next small adjustment. It reads local simulation data only:

- current Backtest Lab run summary
- latest validation suite
- latest research quality review
- latest simulation runbook status
- latest readiness gate and manual approval state

It does not place trades, connect to brokers, stream live data, store API keys, or enable paper-demo execution.

## Common Reasons Readiness Fails

- drawdown is too high
- win rate is unstable
- average R is weak
- false positives are too frequent
- confidence threshold is too low
- confluence threshold is too low
- session performance is weak
- stop model is too loose or too tight
- not enough trades passed filters
- aggressive settings look better than conservative settings

## Suggested Adjustment Logic

If drawdown is high:

- raise minimum confluence or confidence by a small amount
- reduce the session scope
- compare stop models

If too few trades pass:

- slightly lower one threshold
- widen the session filter
- avoid lowering every gate at once

If win rate is low:

- compare NY AM vs London
- compare long-only vs short-only
- test latest swing, fixed ticks, and FVG invalidation

If average R is low:

- adjust target R multiple
- compare stop model behavior
- avoid increasing risk just to make the report look better

If skipped signals are high:

- inspect confluence threshold
- inspect confidence threshold
- inspect agent weights
- check whether conservative filters are too strict for the mock sample

## Beginner Rules

- change only one variable at a time
- start with conservative thresholds
- compare sessions separately
- compare long and short separately
- compare stop models separately
- prefer stability over highest profit
- keep conservative settings as the benchmark
- do not treat one large simulated winner as proof

## Readiness Path

The assistant tracks this path:

1. Baseline run complete
2. Conservative scenario stable
3. Validation suite complete
4. Research quality review complete
5. Simulation runbook passed
6. Readiness gate reviewed

Paper-demo planning should remain blocked until this path is complete and the Readiness Gate reaches Paper-Demo Candidate.
