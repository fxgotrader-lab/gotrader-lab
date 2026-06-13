# CISD Performance Audit

Generated from `npm.cmd run test:cisd-performance` on explicit MT5 read-only history.

## Scope

- Strategy: `cisd_v1`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Authority: `executionAuthority none`, `brokerAuthority none`, `readinessOverrideAuthority none`
- Data policy: raw candles stayed internal to the CLI diagnostic; the report uses compact counts only.

## Data Depth

| Timeframe | Candles | Chunks | Lookback | Status |
|---|---:|---:|---:|---|
| 5m | 17,799 | 13 | 88.95 days | sufficient |
| 15m | 5,933 | 13 | 88.95 days | sufficient |

USTECH remains CFD/proxy data for requested MNQ and is not CME futures truth.

## Detector Funnel

| Metric | Count |
|---|---:|
| Evaluated windows | 23,732 |
| Setup-condition hits | 6,833 |
| Blocked candidates | 21,658 |
| No-trade windows | 7,469 |
| Insufficient-data windows | 34 |
| Valid replay candidates | 109 |

Top blockers:

| Blocker | Count |
|---|---:|
| no prior clear delivery trend | 9,396 |
| no close beyond a significant prior candle body in the opposite direction | 7,469 |
| multiple opposite delivery shifts in chop | 2,963 |
| weak CISD candle body/displacement | 1,642 |
| reward/risk below 2R | 108 |
| no retest of CISD open-to-close body | 46 |
| insufficient candles for prior delivery, CISD, and retest | 34 |

## Performance Summary

| Segment | Candidates | Target-first | Invalidation-first | Stalled | Avg RR | Median RR |
|---|---:|---:|---:|---:|---:|---:|
| All CISD | 109 | 25.69% | 72.48% | 2 | 10.2322 | 8.3357 |
| 5m | 90 | 27.78% | 70.00% | 2 | 9.8838 | 8.1227 |
| 15m | 19 | 15.79% | 84.21% | 0 | 11.8823 | 10.3746 |
| Long | 44 | 29.55% | 68.18% | 1 | 9.3447 | 7.8418 |
| Short | 65 | 23.08% | 75.38% | 1 | 10.8329 | 9.0491 |
| RTH open | 3 | 33.33% | 66.67% | 0 | 8.6624 | 6.3147 |
| RTH non-open | 28 | 32.14% | 67.86% | 0 | 7.4181 | 6.2050 |
| Outside RTH | 78 | 23.08% | 74.36% | 2 | 11.3027 | 9.7097 |

## Rolling / OOS

| Window | Dates | Candidates | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
| 1 | 2026-03-16 to 2026-04-15 | 30 | 40.00% | 56.67% |
| 2 | 2026-03-31 to 2026-04-30 | 29 | 27.59% | 72.41% |
| 3 | 2026-04-15 to 2026-05-15 | 42 | 19.05% | 80.95% |
| 4 | 2026-04-30 to 2026-05-30 | 42 | 16.67% | 83.33% |

First half:
- Candidates: 54
- Target-first: 33.33%
- Invalidation-first: 64.81%

Second half:
- Candidates: 55
- Target-first: 18.18%
- Invalidation-first: 80.00%

OOS verdict: `degraded`.

## Robustness Classification

`rejected`

The detector finds enough independent dates and rolling windows, but the replay outcomes are poor. The high average RR is not useful because invalidation-first dominates and OOS performance degrades across later windows.

## Promotion Decision

Do not promote CISD. Keep `cisd_v1` replay-required/research-only. It is registered as an executable research detector so future refinement can be measured, but this v1 profile is not a Paper-Demo candidate and should not create readiness evidence by recognition alone.

## Recommended Next Work

- Do not loosen the 2R rule to force candidates.
- Investigate whether CISD needs a stricter session-open-only variant; current RTH-open sample is only 3 candidates.
- Study why body-zone retests are frequently invalidation-first before target-first.
- Consider adding a displacement quality filter or opposing-liquidity realism filter before retesting.
- Keep broad CISD v1 as a baseline comparison only.
