# Turtle Soup v1 Performance Audit

Date: 2026-06-13

This audit evaluates the new research-only `turtle_soup_v1` detector on explicit MT5 read-only USTECH history for requested MNQ.

Safety boundary:
- Execution authority: none
- Broker authority: none
- Readiness override authority: none
- No broker execution, account access, order data, position data, secrets, raw candles, raw snapshots, or readiness override

## Source

- Provider: MT5 read-only
- Requested symbol: MNQ
- Broker symbol: USTECH
- Entry timeframe: 5m
- Setup timeframe: 15m
- Lookback requested: 90 days
- Entry candles available: 16,419
- Setup candles available: 5,473
- Available lookback: 88.95 days
- Data depth status: sufficient
- Instrument note: USTECH is CFD/proxy research data for MNQ, not CME futures truth.

## Detector Rules

Turtle Soup v1 is an executable research detector. It requires:

- 15m or 1h setup range
- 5m entry context
- London Open or New York Open session
- sweep of clear range high or low
- immediate rejection within one to three 5m candles
- 5m market structure shift confirming reversal
- retest entry
- stop beyond the actual sweep wick
- target opposing range liquidity
- minimum RR >= 2.5
- no mock/sample source
- high-impact news blocker when known

## 90-Day Result

- Session evaluations: 2,520
- Valid candidates: 0
- Target-first: 0
- Invalidation-first: 0
- Stalled: 0
- Unique trading dates: 0
- Active rolling windows: 0
- OOS verdict: insufficient_data
- Robustness classification: needs_more_data

Session result:
- London Open: 0 candidates
- New York Open: 0 candidates

Side result:
- Long: 0 candidates
- Short: 0 candidates

Top blockers:
- No fresh sweep of the setup range high/low: 2,509
- No immediate 1-3 candle rejection after Turtle Soup sweep: 9
- No 5m market structure shift confirming Turtle Soup reversal: 2

## Decision

Do not promote Turtle Soup.

The detector is wired and executable for research, but the strict v1 rules found no valid candidates on the current 90-day USTECH/MNQ window. That is a valid diagnostic outcome, not a failure.

Current status:
- `turtle_soup_v1`: executable research, replay-required, no Paper-Demo eligibility

Next safe action:
- Keep Turtle Soup as a research detector.
- Review whether the setup range definition is too strict for USTECH CFD/proxy session behavior before changing thresholds.
- Any future changes must run replay, walk-forward/OOS, evidence, maturity, and readiness checklist gates.
