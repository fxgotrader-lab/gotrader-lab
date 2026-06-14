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
| 5m | 17,524 | 7 | 90 days | sufficient |
| 15m | 5,841 | 7 | 89.99 days | sufficient |
| 1h | 1,461 | 7 | 89.96 days | sufficient |

USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth.

## Detector Funnel

| Metric | Count |
|---|---:|
| Evaluated windows | 4,803 |
| Setup-condition hits | 4,803 |
| Blocked candidates | 651 |
| No-trade windows | 0 |
| Insufficient-data windows | 0 |
| Valid replay candidates | 599 |

Top blockers:

| Blocker | Count |
|---|---:|
| IFVG zone was already used before inversion. | 462 |
| IFVG direction is against available HTF context. | 166 |
| unrealistic_rr | 23 |

## Performance Summary

| Segment | Candidates | Target-first | Invalidation-first | Stalled | Avg RR | Median RR |
|---|---:|---:|---:|---:|---:|---:|
| All IFVG | 599 | 56.43% | 43.57% | 0 | 8.7597 | 7.9194 |
| 5m | 442 | 56.79% | 43.21% | 0 | 8.6682 | 7.8897 |
| 15m | 157 | 55.41% | 44.59% | 0 | 9.017 | 8.29 |
| long | 298 | 57.38% | 42.62% | 0 | 8.6555 | 7.9265 |
| short | 301 | 55.48% | 44.52% | 0 | 8.8627 | 7.9194 |
| london_open | 49 | 51.02% | 48.98% | 0 | 9.1128 | 7.7546 |
| new_york_open | 41 | 53.66% | 46.34% | 0 | 8.1403 | 6.0185 |
| other_rth | 155 | 54.19% | 45.81% | 0 | 8.6636 | 7.9025 |
| outside_rth | 354 | 58.47% | 41.53% | 0 | 8.8246 | 8.2456 |

## Rolling / OOS

| Window | Dates | Candidates | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
| 1 | 2026-03-17 to 2026-04-16 | 179 | 64.25% | 35.75% |
| 2 | 2026-04-01 to 2026-05-01 | 190 | 57.89% | 42.11% |
| 3 | 2026-04-16 to 2026-05-16 | 204 | 52.94% | 47.06% |
| 4 | 2026-05-01 to 2026-05-31 | 209 | 51.67% | 48.33% |
| 5 | 2026-05-16 to 2026-06-15 | 216 | 53.24% | 46.76% |

First half:
- Candidates: 299
- Target-first: 59.20%
- Invalidation-first: 40.80%

Second half:
- Candidates: 300
- Target-first: 53.67%
- Invalidation-first: 46.33%

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
