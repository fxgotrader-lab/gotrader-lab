# Zero-Trade Diagnostics

Zero simulated trades means the strategy cannot be evaluated yet. It is not a passing result, and it is not enough evidence to mark the system as Paper-Demo Candidate.

GoTrader AI Lab now diagnoses zero-trade runs and tries bounded recovery configurations before declaring Not Ready.

## Why Zero Trades Matter

Backtests, validation, research quality, and readiness gates all need simulated outcomes. If no trade records exist, there is no win rate, average R, drawdown, false-positive sample, or confidence calibration to trust.

Zero trades should be treated as an evidence-generation problem first.

## Common Causes

- No mock candles are available.
- The mock candle sample is too short for the warmup, decision interval, and resolution window.
- No ICT context or thesis was generated.
- The CIO thesis stayed neutral.
- The simulated trade plan is missing an entry zone, invalidation, or target.
- Confluence threshold is too high.
- Confidence threshold is too high.
- Session filter excluded all setups.
- Long/short filters excluded all directional setups.
- Stop model created an invalid risk profile.
- Max bars to resolve is too short.
- The backtest engine did not convert an eligible signal into a simulated trade.

## Recovery Pass

When the active backtest produces zero trades, Auto Research runs a bounded trade-generation recovery pass. The recovery candidates can:

- Lower confluence threshold slightly.
- Lower confidence threshold slightly.
- Widen the session filter to all.
- Allow both long and short simulated theses.
- Test latest-swing stop logic.
- Test FVG invalidation.
- Extend max bars to resolve.

These changes are logged as recovery candidates. They remain simulation-only and do not change active settings automatically.

## Recovery Outcomes

If recovery still produces zero trades, the final result is:

`No valid simulated trades were generated. Strategy cannot be evaluated yet.`

If recovery produces trades but fails stability, the normal stability-first evaluation continues and readiness remains blocked.

If recovery produces trades and improves stability, Auto Research may create a research calibration candidate proposal. The proposal is approval-required and cannot enable broker/demo/live trading.

## Readiness Impact

The Readiness Gate has a distinct blocker:

`Insufficient simulated trades. Readiness cannot be evaluated.`

This is separate from a strategy failure. It means the system needs enough simulated trade evidence before any paper-demo review can be considered.

## Safety

Zero-trade recovery does not weaken readiness gates. It cannot execute trades, connect to brokers, enable demo/live mode, override readiness, or approve its own proposals.

