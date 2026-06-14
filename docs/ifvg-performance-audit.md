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
| Blocked candidates | 516 |
| No-trade windows | 0 |
| Insufficient-data windows | 0 |
| Valid replay candidates | 676 |

Top blockers:

| Blocker | Count |
|---|---:|
| IFVG zone was already used before inversion. | 372 |
| IFVG direction is against available HTF context. | 144 |

## Performance Summary

| Segment | Candidates | Target-first | Invalidation-first | Stalled | Avg RR | Median RR |
|---|---:|---:|---:|---:|---:|---:|
| All IFVG | 676 | 56.21% | 43.79% | 0 | 53.3633 | 12.1925 |
| 5m | 501 | 56.69% | 43.31% | 0 | 58.4925 | 11.7564 |
| 15m | 175 | 54.86% | 45.14% | 0 | 38.6789 | 13.0123 |
| long | 336 | 55.65% | 44.35% | 0 | 65.234 | 12.1925 |
| short | 340 | 56.76% | 43.24% | 0 | 41.6322 | 12.1979 |
| london_open | 50 | 52.00% | 48.00% | 0 | 38.9954 | 13.4609 |
| new_york_open | 41 | 58.54% | 41.46% | 0 | 42.7352 | 10.728 |
| other_rth | 177 | 57.63% | 42.37% | 0 | 75.7818 | 12.2159 |
| outside_rth | 408 | 55.88% | 44.12% | 0 | 46.4664 | 12.2003 |

## Rolling / OOS

| Window | Dates | Candidates | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
| 1 | 2026-03-16 to 2026-04-15 | 200 | 62.00% | 38.00% |
| 2 | 2026-03-31 to 2026-04-30 | 203 | 58.13% | 41.87% |
| 3 | 2026-04-15 to 2026-05-15 | 229 | 51.09% | 48.91% |
| 4 | 2026-04-30 to 2026-05-30 | 244 | 52.46% | 47.54% |

First half:
- Candidates: 338
- Target-first: 58.88%
- Invalidation-first: 41.12%

Second half:
- Candidates: 338
- Target-first: 53.55%
- Invalidation-first: 46.45%

OOS verdict: `passed`.

## Robustness Classification

`no_edge`

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
