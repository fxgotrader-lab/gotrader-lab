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
| invalidation_first_rate | 40.57% | <= 35.00% | hard |

## Expectancy Summary

| Segment | Candidates | Target-first | Invalidation-first | Avg R | Median R | Profit Factor | Avg RR | Max DD R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| all_ifvg | 599 | 59.43% | 40.57% | 4.7621 | 3.9924 | 12.7387 | 8.7081 | 8 |
| 5m | 441 | 60.77% | 39.23% | 4.7673 | 4.0301 | 13.1526 | 8.6039 | 8 |
| 15m | 158 | 55.70% | 44.30% | 4.7476 | 3.5807 | 11.7159 | 8.9992 | 5 |
| long | 301 | 60.13% | 39.87% | 4.6439 | 4.0814 | 12.6485 | 8.6992 | 8 |
| short | 298 | 58.72% | 41.28% | 4.8815 | 3.6961 | 12.8267 | 8.7172 | 6 |
| new_york_open | 38 | 55.26% | 44.74% | 4.5603 | 3.3644 | 11.1937 | 8.5274 | 2 |
| outside_rth | 361 | 59.56% | 40.44% | 4.9245 | 4.1126 | 13.1764 | 8.7423 | 6 |

## Cost Sensitivity

| Cost Model | Avg R | Median R | Profit Factor | Total R | Max DD R | Longest Losing Streak |
|---|---:|---:|---:|---:|---:|---:|
| 0R | 4.7621 | 3.9924 | 12.7387 | 2852.505 | 8 | 8 |
| 0.25R | 4.5121 | 3.7424 | 9.898 | 2702.755 | 10 | 8 |
| 0.5R | 4.2621 | 3.4924 | 8.0041 | 2553.005 | 12 | 8 |
| 1R | 3.7621 | 2.9924 | 5.6368 | 2253.505 | 16 | 8 |

## Filter Analysis

| Filter | Candidates | Target-first | Invalidation-first | Avg R | Avg R @ 0.5R Cost | Dates | Windows | OOS | Classification | Top Failed Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| rr_10_plus | 203 | 60.59% | 39.41% | 8.1726 | 7.6726 | 65 | 5 | passed | needs_filtering | invalidation_first_rate |
| htf_aligned_only | 348 | 62.64% | 37.36% | 4.9563 | 4.4563 | 70 | 5 | passed | needs_filtering | invalidation_first_rate |
| small_ifvg | 560 | 58.93% | 41.07% | 4.9385 | 4.4385 | 70 | 5 | passed | needs_filtering | invalidation_first_rate |
| short_only | 298 | 58.72% | 41.28% | 4.8815 | 4.3815 | 67 | 5 | passed | needs_filtering | invalidation_first_rate |
| five_minute_only | 441 | 60.77% | 39.23% | 4.7673 | 4.2673 | 70 | 5 | passed | needs_filtering | invalidation_first_rate |
| all_ifvg | 599 | 59.43% | 40.57% | 4.7621 | 4.2621 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| first_ifvg_use_only | 599 | 59.43% | 40.57% | 4.7621 | 4.2621 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| external_liquidity_target_present | 599 | 59.43% | 40.57% | 4.7621 | 4.2621 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| fifteen_minute_only | 158 | 55.70% | 44.30% | 4.7476 | 4.2476 | 58 | 5 | passed | needs_filtering | invalidation_first_rate |
| long_only | 301 | 60.13% | 39.87% | 4.6439 | 4.1439 | 69 | 5 | passed | needs_filtering | invalidation_first_rate |
| ny_open_only | 38 | 55.26% | 44.74% | 4.5603 | 4.0603 | 27 | 5 | passed | needs_filtering | invalidation_first_rate |
| avoid_outside_rth | 238 | 59.24% | 40.76% | 4.5158 | 4.0158 | 61 | 5 | passed | needs_filtering | invalidation_first_rate |
| rr_5_to_10 | 241 | 57.26% | 42.74% | 3.7688 | 3.2688 | 66 | 5 | passed | needs_filtering | invalidation_first_rate |
| medium_ifvg | 39 | 66.67% | 33.33% | 2.2289 | 1.7289 | 24 | 5 | passed | needs_filtering | rolling_window_stability |
| rr_2_to_5 | 155 | 61.29% | 38.71% | 1.8399 | 1.3399 | 58 | 5 | passed | needs_filtering | invalidation_first_rate |
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
