# Silver Bullet v2 Refinement Audit

Date: 2026-06-13

This audit compares the rejected `silver_bullet_v1` baseline with the refined research-only `silver_bullet_v2_refined_research` detector.

Safety boundary:
- Execution authority: none
- Broker authority: none
- Readiness override authority: none
- MT5 access: read-only candles only
- No account, order, position, secret, raw candle, or raw snapshot data is written to this report

## Source

- Provider: MT5 read-only
- Requested symbol: MNQ
- Broker symbol: USTECH
- Primary timeframe: 1m
- Context: 5m and 15m derived from the explicit 1m history for diagnostic alignment
- Lookback requested: 90 days
- Candles available: 88,984 x 1m
- Available lookback: 88.95 days
- Data depth status: sufficient
- Instrument note: USTECH is CFD/proxy research data for MNQ, not CME futures truth.

## V2 Filters Added

Silver Bullet v2 keeps the original killzone, sweep, directional FVG, FVG return, minimum RR, and read-only authority requirements. It adds stricter gates:

- meaningful prior swing/equal high-low sweep
- sweep must occur early enough inside the killzone
- directional FVG within five candles after the sweep
- displacement body must be meaningful relative to recent range
- FVG must not be too small
- return must occur within ten candles
- FVG cannot be fully violated before entry
- stop distance cannot be unrealistically tiny
- target must be nearest logical liquidity, not a far historical extreme
- RR diagnostic cap is 15R
- 5m/15m context alignment is required when available
- high-impact news blocks when known
- unknown VWAP/news is warning-only, never fabricated

## V1 Baseline

- Valid candidates: 152
- Target-first: 16
- Invalidation-first: 132
- Stalled: 4
- Target-first rate: 10.53%
- Invalidation-first rate: 86.84%
- Unique trading dates: 63
- OOS verdict: degraded
- Robustness classification: rejected

Session result:
- London: 54 candidates, 7.41% target-first
- NY AM: 50 candidates, 16.00% target-first
- NY PM: 48 candidates, 8.33% target-first

V1 remains rejected/research-only.

## V2 Result

- Valid candidates: 3
- Candidate reduction from v1: 98.03%
- Target-first: 1
- Invalidation-first: 2
- Stalled: 0
- Target-first rate: 33.33%
- Invalidation-first rate: 66.67%
- Average capped RR: 2.1095
- Median capped RR: 2.1018
- Unique trading dates: 3
- Active rolling windows: 3
- OOS verdict: insufficient_data
- Robustness classification: needs_more_data

Session result:
- London: 0 candidates
- NY AM: 2 candidates, 50.00% target-first
- NY PM: 1 candidate, 0.00% target-first

Side result:
- Long: 3 candidates, 33.33% target-first
- Short: 0 candidates

Top v2 blockers:
- No meaningful prior swing/equal high-low sweep in first half of window
- 5m/15m context does not align
- No timely directional FVG with meaningful displacement
- No timely return to refined FVG

## Decision

Do not promote Silver Bullet v2.

The refinement successfully removes most weak v1 candidates, but it does not yet produce enough quality evidence. Three candidates are not enough for Paper-Demo, paper-watchlist promotion, or readiness progression.

Current status:
- `silver_bullet_v1`: rejected/research-only baseline
- `silver_bullet_v2_refined_research`: executable research, replay-required, needs more data

Next safe action:
- Keep v2 registered as research-only executable detector.
- Continue collecting explicit replay/OOS evidence.
- Do not loosen gates simply to increase sample count.
