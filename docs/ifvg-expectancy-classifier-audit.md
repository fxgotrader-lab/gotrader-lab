# IFVG Expectancy Classifier Audit

Generated from `npm.cmd run test:ifvg-expectancy-classifier` on explicit MT5 read-only history.

## Scope

- Strategy: `ifvg_v1`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Authority: `executionAuthority none`, `brokerAuthority none`, `readinessOverrideAuthority none`
- Data policy: raw candles stayed internal to the CLI diagnostic; this report stores compact metrics only.

## Root Cause

The prior `no_edge` label was not caused by weak raw target-first rate or low RR. IFVG failed the paper-watchlist gate because invalidation-first rate stayed above the allowed ceiling and rolling windows weakened in the second half. That makes the better classification `needs_filtering`, not automatic promotion.

Exact gate audit:

| Gate | Actual | Required | Severity |
|---|---:|---:|---|
| invalidation_first_rate | 43.07% | <= 35.00% | hard |
| rolling_window_stability | 2 weak active window(s) | 0 weak active windows | soft |

## Expectancy Summary

| Segment | Candidates | Target-first | Invalidation-first | Avg R | Median R | Profit Factor | Avg RR | Max DD R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| all_ifvg | 613 | 56.93% | 43.07% | 4.3534 | 3.5022 | 11.1084 | 8.6703 | 15 |
| 5m | 452 | 57.08% | 42.92% | 4.1481 | 3.4897 | 10.6646 | 8.5661 | 15 |
| 15m | 161 | 56.52% | 43.48% | 4.9296 | 3.5806 | 12.3382 | 8.9629 | 5 |
| long | 302 | 54.97% | 45.03% | 3.9819 | 3.1982 | 9.8422 | 8.5059 | 8 |
| short | 311 | 58.84% | 41.16% | 4.714 | 3.9182 | 12.4536 | 8.8299 | 8 |
| new_york_open | 36 | 61.11% | 38.89% | 4.6703 | 4.1746 | 13.0094 | 8.1623 | 3 |
| outside_rth | 375 | 56.53% | 43.47% | 4.5391 | 3.5807 | 11.4428 | 8.7482 | 11 |

## Cost Sensitivity

| Cost Model | Avg R | Median R | Profit Factor | Total R | Max DD R | Longest Losing Streak |
|---|---:|---:|---:|---:|---:|---:|
| 0R | 4.3534 | 3.5022 | 11.1084 | 2668.6081 | 15 | 15 |
| 0.25R | 4.1034 | 3.2522 | 8.6223 | 2515.3581 | 18.75 | 15 |
| 0.5R | 3.8534 | 3.0022 | 6.9649 | 2362.1081 | 22.5 | 15 |
| 1R | 3.3534 | 2.5022 | 4.8932 | 2055.6081 | 30 | 15 |

## Filter Analysis

| Filter | Candidates | Target-first | Invalidation-first | Avg R | Avg R @ 0.5R Cost | Dates | Windows | OOS | Classification | Top Failed Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| rr_10_plus | 204 | 52.45% | 47.55% | 7.0106 | 6.5106 | 66 | 4 | passed | needs_filtering | target_first_rate |
| fifteen_minute_only | 161 | 56.52% | 43.48% | 4.9296 | 4.4296 | 60 | 4 | passed | needs_filtering | invalidation_first_rate |
| short_only | 311 | 58.84% | 41.16% | 4.714 | 4.214 | 64 | 4 | passed | needs_filtering | invalidation_first_rate |
| ny_open_only | 36 | 61.11% | 38.89% | 4.6703 | 4.1703 | 27 | 4 | passed | needs_filtering | invalidation_first_rate |
| htf_aligned_only | 339 | 61.65% | 38.35% | 4.6477 | 4.1477 | 68 | 4 | passed | needs_filtering | invalidation_first_rate |
| small_ifvg | 574 | 56.27% | 43.73% | 4.5026 | 4.0026 | 72 | 4 | passed | needs_filtering | invalidation_first_rate |
| all_ifvg | 613 | 56.93% | 43.07% | 4.3534 | 3.8534 | 72 | 4 | passed | needs_filtering | invalidation_first_rate |
| first_ifvg_use_only | 613 | 56.93% | 43.07% | 4.3534 | 3.8534 | 72 | 4 | passed | needs_filtering | invalidation_first_rate |
| external_liquidity_target_present | 613 | 56.93% | 43.07% | 4.3534 | 3.8534 | 72 | 4 | passed | needs_filtering | invalidation_first_rate |
| five_minute_only | 452 | 57.08% | 42.92% | 4.1481 | 3.6481 | 71 | 4 | passed | needs_filtering | invalidation_first_rate |
| avoid_outside_rth | 238 | 57.56% | 42.44% | 4.0607 | 3.5607 | 62 | 4 | passed | needs_filtering | invalidation_first_rate |
| long_only | 302 | 54.97% | 45.03% | 3.9819 | 3.4819 | 70 | 4 | passed | needs_filtering | target_first_rate |
| rr_5_to_10 | 249 | 57.43% | 42.57% | 3.7482 | 3.2482 | 66 | 4 | passed | needs_filtering | invalidation_first_rate |
| medium_ifvg | 39 | 66.67% | 33.33% | 2.1572 | 1.6572 | 25 | 4 | passed | needs_filtering | rolling_window_stability |
| rr_2_to_5 | 160 | 61.88% | 38.12% | 1.9072 | 1.4072 | 61 | 4 | passed | needs_filtering | invalidation_first_rate |
| large_ifvg | 0 | 0.00% | 0.00% | 0 | 0 | 0 | 0 | insufficient_data | too_strict | minimum_candidate_count |

## Best Variant

No IFVG filter variant met paper-watchlist evidence gates.

## Promotion Decision

No IFVG promotion. Keep IFVG replay-required/research-only and test narrower filters before any paper-watchlist progression.

## Recommendation

Keep IFVG research-only. The signal is not a simple `no_edge` reject, but the current detector needs filtering before paper-watchlist consideration. The next safe refinement should focus on reducing invalidation-first rate and rolling-window weakness, especially by testing NY open, short-only, HTF-aligned, and RR-bucket variants with explicit cost assumptions.

## Safety Result

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no order placement
- no readiness override
- authority `none/none/none`
