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
| 15m | 5,842 | 7 | 90 days | sufficient |
| 1h | 1,461 | 7 | 89.96 days | sufficient |

USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth.

## Detector Funnel

| Metric | Count |
|---|---:|
| Evaluated windows | 4,803 |
| Setup-condition hits | 4,803 |
| Blocked candidates | 635 |
| No-trade windows | 0 |
| Insufficient-data windows | 0 |
| Valid replay candidates | 599 |

Top blockers:

| Blocker | Count |
|---|---:|
| IFVG zone was already used before inversion. | 447 |
| IFVG direction is against available HTF context. | 164 |
| unrealistic_rr | 24 |

## Performance Summary

| Segment | Candidates | Target-first | Invalidation-first | Stalled | Avg RR | Median RR |
|---|---:|---:|---:|---:|---:|---:|
| All IFVG | 599 | 59.43% | 40.57% | 0 | 8.7081 | 7.9261 |
| 5m | 441 | 60.77% | 39.23% | 0 | 8.6039 | 7.8962 |
| 15m | 158 | 55.70% | 44.30% | 0 | 8.9992 | 8.3135 |
| long | 301 | 60.13% | 39.87% | 0 | 8.6992 | 8.0294 |
| short | 298 | 58.72% | 41.28% | 0 | 8.7172 | 7.8926 |
| london_open | 43 | 65.12% | 34.88% | 0 | 8.6657 | 6.9632 |
| new_york_open | 38 | 55.26% | 44.74% | 0 | 8.5274 | 6.7194 |
| other_rth | 157 | 58.60% | 41.40% | 0 | 8.685 | 7.9864 |
| outside_rth | 361 | 59.56% | 40.44% | 0 | 8.7423 | 8.1584 |

## Rolling / OOS

| Window | Dates | Candidates | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
| 1 | 2026-03-17 to 2026-04-16 | 180 | 60.00% | 40.00% |
| 2 | 2026-04-01 to 2026-05-01 | 191 | 57.07% | 42.93% |
| 3 | 2026-04-16 to 2026-05-16 | 207 | 57.97% | 42.03% |
| 4 | 2026-05-01 to 2026-05-31 | 207 | 57.97% | 42.03% |
| 5 | 2026-05-16 to 2026-06-15 | 212 | 60.38% | 39.62% |

First half:
- Candidates: 299
- Target-first: 57.53%
- Invalidation-first: 42.47%

Second half:
- Candidates: 300
- Target-first: 61.33%
- Invalidation-first: 38.67%

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
