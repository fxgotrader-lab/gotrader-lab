# IFVG Performance Audit

Generated from `npm.cmd run test:ifvg-performance` on explicit MT5 read-only history.

## Scope

- Strategy: `ifvg_v1`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Authority: `executionAuthority none`, `brokerAuthority none`, `readinessOverrideAuthority none`
- Data policy: raw candles stayed internal to the CLI diagnostic; the report uses compact counts only.

## Data Depth

| Timeframe | Candles | Chunks | Lookback | Status |
|---|---:|---:|---:|---|
| 5m | 17,799 | 7 | 88.95 days | sufficient |
| 15m | 5,933 | 7 | 88.95 days | sufficient |
| 1h | 1,484 | 7 | 88.92 days | sufficient |

USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth.

## Detector Funnel

| Metric | Count |
|---|---:|
| Evaluated windows | 4,878 |
| Setup-condition hits | 4,878 |
| Blocked candidates | 661 |
| No-trade windows | 0 |
| Insufficient-data windows | 0 |
| Valid replay candidates | 613 |

Top blockers:

| Blocker | Count |
|---|---:|
| IFVG zone was already used before inversion. | 473 |
| IFVG direction is against available HTF context. | 166 |
| unrealistic_rr | 22 |

## Performance Summary

| Segment | Candidates | Target-first | Invalidation-first | Stalled | Avg RR | Median RR |
|---|---:|---:|---:|---:|---:|---:|
| All IFVG | 613 | 56.93% | 43.07% | 0 | 8.6703 | 7.8832 |
| 5m | 452 | 57.08% | 42.92% | 0 | 8.5661 | 7.7609 |
| 15m | 161 | 56.52% | 43.48% | 0 | 8.9629 | 8.2368 |
| long | 302 | 54.97% | 45.03% | 0 | 8.5059 | 7.8214 |
| short | 311 | 58.84% | 41.16% | 0 | 8.8299 | 7.902 |
| london_open | 42 | 57.14% | 42.86% | 0 | 8.5591 | 7.3589 |
| new_york_open | 36 | 61.11% | 38.89% | 0 | 8.1623 | 6.1773 |
| other_rth | 160 | 56.87% | 43.13% | 0 | 8.6312 | 7.8329 |
| outside_rth | 375 | 56.53% | 43.47% | 0 | 8.7482 | 8.0294 |

## Rolling / OOS

| Window | Dates | Candidates | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
| 1 | 2026-03-16 to 2026-04-15 | 182 | 62.64% | 37.36% |
| 2 | 2026-03-31 to 2026-04-30 | 188 | 59.04% | 40.96% |
| 3 | 2026-04-15 to 2026-05-15 | 209 | 50.24% | 49.76% |
| 4 | 2026-04-30 to 2026-05-30 | 222 | 51.80% | 48.20% |

First half:
- Candidates: 306
- Target-first: 59.80%
- Invalidation-first: 40.20%

Second half:
- Candidates: 307
- Target-first: 54.07%
- Invalidation-first: 45.93%

OOS verdict: `passed`.

## Robustness Classification

`needs_filtering`

## Promotion Decision

Do not promote IFVG; keep replay-required/research-only until replay, OOS, evidence, maturity, and checklist gates improve.

## Recommendation

IFVG v1 is now measurable as an executable research detector. Treat strategy rejection as a valid outcome. Only consider a narrower variant if this audit shows an independent-date, OOS-stable paper-watchlist signal. Recognition alone is not evidence.

## Safety Result

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no order placement
- no readiness override
- authority `none/none/none`
