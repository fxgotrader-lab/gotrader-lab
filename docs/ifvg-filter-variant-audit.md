# IFVG Filter Variant Audit

Generated from `npm.cmd run test:ifvg-filter-variants` on explicit MT5 read-only history.

## Scope

- Base strategy: `ifvg_v1`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Authority: `executionAuthority none`, `brokerAuthority none`, `readinessOverrideAuthority none`
- Data policy: raw candles stayed internal to the CLI diagnostic; this report stores compact metrics only.

## Gate Summary

| Gate | Required |
|---|---|
| Candidates | >= 20 |
| Unique dates | >= 3 |
| Active rolling windows | >= 2 |
| Weak rolling windows | 0 |
| Target-first | >= 55.00% |
| Invalidation-first | <= 35.00% |
| OOS | cannot degrade/fail |
| Cost sensitivity | average R positive after 0.5R and 1.0R cost |
| Source | no mock/sample source |
| Authority | none/none/none |

## Variant Results

| Variant | Candidates | Dates | Windows | Weak Windows | Target-first | Invalidation-first | Avg R | Avg R @ 0.5R | Avg R @ 1R | Profit Factor | Max DD R | OOS | Classification | Failed Gates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| clean_retest_displacement | 27 | 21 | 5 | 0 | 85.19% | 14.81% | 6.2463 | 5.7463 | 5.2463 | 43.1627 | 1 | passed | paper_watchlist_candidate | none |
| displacement_confirmation | 194 | 61 | 5 | 0 | 74.74% | 25.26% | 5.6018 | 5.1018 | 4.6018 | 23.1784 | 3 | passed | paper_watchlist_candidate | none |
| premium_discount_aligned | 264 | 62 | 5 | 0 | 71.97% | 28.03% | 5.6777 | 5.1777 | 4.6777 | 21.2557 | 3 | passed | paper_watchlist_candidate | none |
| ny_open_shorts | 18 | 14 | 5 | 0 | 72.22% | 27.78% | 5.9275 | 5.4275 | 4.9275 | 22.3389 | 1 | insufficient_data | insufficient_data | candidate_count |
| ny_open_htf_aligned | 23 | 20 | 5 | 1 | 65.22% | 34.78% | 5.1247 | 4.6247 | 4.1247 | 15.7336 | 2 | passed | needs_filtering | rolling_window_stability |
| ny_open_only | 34 | 25 | 5 | 1 | 64.71% | 35.29% | 5.0873 | 4.5873 | 4.0873 | 15.414 | 2 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| rr_2_to_3 | 33 | 25 | 5 | 0 | 63.64% | 36.36% | 1.2248 | 0.7248 | 0.2248 | 4.3681 | 6 | passed | needs_filtering | invalidation_first_rate |
| short_htf_aligned | 157 | 57 | 5 | 0 | 63.06% | 36.94% | 4.6799 | 4.1799 | 3.6799 | 13.6681 | 3 | passed | needs_filtering | invalidation_first_rate |
| clean_retest_only | 83 | 51 | 5 | 0 | 62.65% | 37.35% | 4.1765 | 3.6765 | 3.1765 | 12.1823 | 4 | passed | needs_filtering | invalidation_first_rate |
| medium_ifvg_htf_aligned | 24 | 17 | 5 | 1 | 62.50% | 37.50% | 1.858 | 1.358 | 0.858 | 5.9546 | 3 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| htf_aligned_only | 341 | 67 | 5 | 1 | 61.29% | 38.71% | 4.5881 | 4.0881 | 3.5881 | 12.8526 | 7 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| medium_ifvg | 38 | 24 | 5 | 2 | 60.53% | 39.47% | 1.8874 | 1.3874 | 0.8874 | 5.7814 | 3.6475 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| rr_3_to_5 | 123 | 56 | 5 | 1 | 59.35% | 40.65% | 1.9798 | 1.4798 | 0.9798 | 5.8703 | 6 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| short_only | 305 | 64 | 5 | 1 | 58.69% | 41.31% | 4.7924 | 4.2924 | 3.7924 | 12.6006 | 4 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| five_minute_only | 446 | 70 | 5 | 2 | 58.07% | 41.93% | 4.3681 | 3.8681 | 3.3681 | 11.4179 | 9 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| first_ifvg_use_only | 604 | 71 | 5 | 1 | 57.45% | 42.55% | 4.4673 | 3.9673 | 3.4673 | 11.4991 | 9 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| external_liquidity_target_present | 604 | 71 | 5 | 1 | 57.45% | 42.55% | 4.4673 | 3.9673 | 3.4673 | 11.4991 | 9 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| small_ifvg | 566 | 71 | 5 | 1 | 57.24% | 42.76% | 4.6405 | 4.1405 | 3.6405 | 11.8535 | 9 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| london_open_shorts | 23 | 20 | 5 | 3 | 56.52% | 43.48% | 4.1917 | 3.6917 | 3.1917 | 10.6409 | 4 | degraded | rejected | rolling_window_stability, invalidation_first_rate, oos_verdict |
| rr_5_plus | 448 | 71 | 5 | 2 | 56.47% | 43.53% | 5.3891 | 4.8891 | 4.3891 | 13.3812 | 6 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| ny_open_longs | 16 | 14 | 5 | 2 | 56.25% | 43.75% | 4.1421 | 3.6421 | 3.1421 | 10.4676 | 2 | insufficient_data | insufficient_data | candidate_count, rolling_window_stability, invalidation_first_rate |
| long_only | 299 | 69 | 5 | 1 | 56.19% | 43.81% | 4.1357 | 3.6357 | 3.1357 | 10.4396 | 8 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| fifteen_minute_only | 158 | 58 | 5 | 2 | 55.70% | 44.30% | 4.7476 | 4.2476 | 3.7476 | 11.7159 | 5 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| london_open_longs | 22 | 18 | 5 | 3 | 54.55% | 45.45% | 3.7211 | 3.2211 | 2.7211 | 9.1865 | 3 | passed | needs_filtering | rolling_window_stability, target_first_rate, invalidation_first_rate |
| medium_ifvg_clean_retest | 4 | 4 | 5 | 3 | 50.00% | 50.00% | 1.3972 | 0.8972 | 0.3972 | 3.7944 | 1 | insufficient_data | insufficient_data | candidate_count, rolling_window_stability, target_first_rate, invalidation_first_rate |
| large_ifvg | 0 | 0 | 0 | 0 | 0.00% | 0.00% | 0 | 0 | 0 | 0 | 0 | insufficient_data | too_strict | candidate_count, unique_trading_dates, active_rolling_windows, target_first_rate, half_r_cost_expectancy, one_r_cost_expectancy |

## Passing Variants

- `clean_retest_displacement`: 27 candidates, 85.19% target-first, 21 dates.
- `displacement_confirmation`: 194 candidates, 74.74% target-first, 61 dates.
- `premium_discount_aligned`: 264 candidates, 71.97% target-first, 62 dates.

## Best Blocked Variants

- `ny_open_shorts`: 72.22% target-first, 27.78% invalidation-first, 18 candidates, failed gates: candidate_count
- `ny_open_htf_aligned`: 65.22% target-first, 34.78% invalidation-first, 23 candidates, failed gates: rolling_window_stability

## Promotion Decision

One or more IFVG filters qualify for research-only paper-watchlist consideration. Paper-Demo remains blocked unless the existing deterministic Paper-Demo checklist passes.

## Advisor / OpenClaw Status

Advisor may reference ifvg_filtered_v2_research as a draft research-only candidate family; OpenClaw may propose validation but cannot auto-apply or approve readiness.

## Recommendation

Validate `clean_retest_displacement` through replay, walk-forward, evidence, maturity, and Paper-Demo checklist gates before any progression.

## Safety Result

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no order placement
- no readiness override
- authority `none/none/none`
