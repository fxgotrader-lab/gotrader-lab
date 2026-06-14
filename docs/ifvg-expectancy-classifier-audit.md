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
| invalidation_first_rate | 39.80% | <= 35.00% | hard |
| rolling_window_stability | 1 weak active window(s) | 0 weak active windows | soft |

## Expectancy Summary

| Segment | Candidates | Target-first | Invalidation-first | Avg R | Median R | Profit Factor | Avg RR | Max DD R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| all_ifvg | 598 | 60.20% | 39.80% | 4.7803 | 4.0763 | 13.0109 | 8.7056 | 5 |
| 5m | 441 | 61.90% | 38.10% | 4.7252 | 4.1143 | 13.4037 | 8.5947 | 4 |
| 15m | 157 | 55.41% | 44.59% | 4.935 | 3.5806 | 12.0684 | 9.017 | 5 |
| long | 295 | 61.69% | 38.31% | 4.7877 | 4.0814 | 13.4989 | 8.6472 | 4 |
| short | 303 | 58.75% | 41.25% | 4.773 | 4.0713 | 12.5698 | 8.7624 | 5 |
| new_york_open | 41 | 58.54% | 41.46% | 4.3912 | 3.475 | 11.5906 | 7.9116 | 5 |
| outside_rth | 358 | 60.61% | 39.39% | 4.9869 | 4.5418 | 13.6618 | 8.8161 | 5 |

## Cost Sensitivity

| Cost Model | Avg R | Median R | Profit Factor | Total R | Max DD R | Longest Losing Streak |
|---|---:|---:|---:|---:|---:|---:|
| 0R | 4.7803 | 4.0763 | 13.0109 | 2858.6026 | 5 | 5 |
| 0.25R | 4.5303 | 3.8264 | 10.1062 | 2709.1026 | 6.25 | 5 |
| 0.5R | 4.2803 | 3.5764 | 8.1698 | 2559.6026 | 7.5 | 5 |
| 1R | 3.7803 | 3.0764 | 5.7492 | 2260.6026 | 10 | 5 |

## Filter Analysis

| Filter | Candidates | Target-first | Invalidation-first | Avg R | Avg R @ 0.5R Cost | Dates | Windows | OOS | Classification | Top Failed Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| htf_aligned_only | 349 | 65.04% | 34.96% | 5.2217 | 4.7217 | 69 | 5 | passed | paper_watchlist_candidate | none |
| rr_10_plus | 201 | 60.20% | 39.80% | 8.0632 | 7.5632 | 67 | 5 | passed | needs_filtering | invalidation_first_rate |
| small_ifvg | 561 | 60.07% | 39.93% | 4.9662 | 4.4662 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| fifteen_minute_only | 157 | 55.41% | 44.59% | 4.935 | 4.435 | 58 | 5 | passed | needs_filtering | invalidation_first_rate |
| long_only | 295 | 61.69% | 38.31% | 4.7877 | 4.2877 | 69 | 5 | passed | needs_filtering | invalidation_first_rate |
| all_ifvg | 598 | 60.20% | 39.80% | 4.7803 | 4.2803 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| first_ifvg_use_only | 598 | 60.20% | 39.80% | 4.7803 | 4.2803 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| external_liquidity_target_present | 598 | 60.20% | 39.80% | 4.7803 | 4.2803 | 71 | 5 | passed | needs_filtering | invalidation_first_rate |
| short_only | 303 | 58.75% | 41.25% | 4.773 | 4.273 | 66 | 5 | passed | needs_filtering | invalidation_first_rate |
| five_minute_only | 441 | 61.90% | 38.10% | 4.7252 | 4.2252 | 70 | 5 | passed | needs_filtering | invalidation_first_rate |
| avoid_outside_rth | 240 | 59.58% | 40.42% | 4.472 | 3.972 | 61 | 5 | passed | needs_filtering | invalidation_first_rate |
| ny_open_only | 41 | 58.54% | 41.46% | 4.3912 | 3.8912 | 27 | 5 | passed | needs_filtering | invalidation_first_rate |
| rr_5_to_10 | 243 | 57.61% | 42.39% | 3.8234 | 3.3234 | 66 | 5 | passed | needs_filtering | invalidation_first_rate |
| rr_2_to_5 | 154 | 64.29% | 35.71% | 2.0054 | 1.5054 | 59 | 5 | passed | needs_filtering | invalidation_first_rate |
| medium_ifvg | 37 | 62.16% | 37.84% | 1.9614 | 1.4614 | 24 | 5 | passed | needs_filtering | invalidation_first_rate |
| large_ifvg | 0 | 0.00% | 0.00% | 0 | 0 | 0 | 0 | insufficient_data | too_strict | minimum_candidate_count |

## Best Variant

Best compact variant: `htf_aligned_only` with 349 candidates, 65.04% target-first, 4.7217 average R after 0.5R cost, and classification `paper_watchlist_candidate`.

## Promotion Decision

IFVG has a filtered paper-watchlist candidate for further deterministic validation only; Paper-Demo remains blocked until the full checklist passes.

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
