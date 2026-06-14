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
| clean_retest_displacement | 26 | 19 | 5 | 0 | 76.92% | 23.08% | 5.0995 | 4.5995 | 4.0995 | 23.098 | 3 | passed | paper_watchlist_candidate | none |
| premium_discount_aligned | 268 | 64 | 5 | 0 | 72.01% | 27.99% | 5.7919 | 5.2919 | 4.7919 | 21.6964 | 4 | passed | paper_watchlist_candidate | none |
| displacement_confirmation | 189 | 62 | 5 | 0 | 70.90% | 29.10% | 5.1135 | 4.6135 | 4.1135 | 18.5719 | 4 | passed | paper_watchlist_candidate | none |
| medium_ifvg | 37 | 24 | 5 | 2 | 64.86% | 35.14% | 2.1148 | 1.6148 | 1.1148 | 7.0189 | 4 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| medium_ifvg_htf_aligned | 22 | 17 | 5 | 2 | 63.64% | 36.36% | 2.0163 | 1.5163 | 1.0163 | 6.5448 | 4 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| rr_3_to_5 | 120 | 57 | 5 | 0 | 62.50% | 37.50% | 2.1689 | 1.6689 | 1.1689 | 6.7838 | 5 | passed | needs_filtering | invalidation_first_rate |
| htf_aligned_only | 347 | 69 | 5 | 1 | 59.94% | 40.06% | 4.697 | 4.197 | 3.697 | 12.7255 | 5 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| rr_2_to_3 | 32 | 26 | 5 | 2 | 59.38% | 40.63% | 1.0751 | 0.5751 | 0.0751 | 3.6465 | 4 | degraded | rejected | rolling_window_stability, invalidation_first_rate, oos_verdict |
| london_open_longs | 27 | 23 | 5 | 2 | 59.26% | 40.74% | 4.4272 | 3.9272 | 3.4272 | 11.8667 | 4 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| ny_open_htf_aligned | 27 | 21 | 5 | 3 | 59.26% | 40.74% | 4.3178 | 3.8178 | 3.3178 | 11.5982 | 3 | degraded | rejected | rolling_window_stability, invalidation_first_rate, oos_verdict |
| short_htf_aligned | 164 | 59 | 5 | 2 | 59.15% | 40.85% | 4.7553 | 4.2553 | 3.7553 | 12.6397 | 5 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| long_only | 298 | 68 | 5 | 1 | 57.38% | 42.62% | 4.3264 | 3.8264 | 3.3264 | 11.1516 | 4 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| clean_retest_only | 79 | 48 | 5 | 2 | 56.96% | 43.04% | 3.6725 | 3.1725 | 2.6725 | 9.5332 | 4 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| five_minute_only | 442 | 70 | 5 | 3 | 56.79% | 43.21% | 4.2204 | 3.7204 | 3.2204 | 10.7666 | 7 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| first_ifvg_use_only | 599 | 71 | 5 | 3 | 56.43% | 43.57% | 4.4077 | 3.9077 | 3.4077 | 11.1157 | 7 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| external_liquidity_target_present | 599 | 71 | 5 | 3 | 56.43% | 43.57% | 4.4077 | 3.9077 | 3.4077 | 11.1157 | 7 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| small_ifvg | 562 | 71 | 5 | 3 | 55.87% | 44.13% | 4.5586 | 4.0586 | 3.5586 | 11.3305 | 7 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| short_only | 301 | 67 | 5 | 3 | 55.48% | 44.52% | 4.4882 | 3.9882 | 3.4882 | 11.0817 | 7 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| fifteen_minute_only | 157 | 58 | 5 | 3 | 55.41% | 44.59% | 4.935 | 4.435 | 3.935 | 12.0684 | 5 | passed | needs_filtering | rolling_window_stability, invalidation_first_rate |
| ny_open_longs | 20 | 17 | 5 | 2 | 55.00% | 45.00% | 4.6061 | 4.1061 | 3.6061 | 11.2358 | 3 | degraded | rejected | rolling_window_stability, invalidation_first_rate, oos_verdict |
| rr_5_plus | 447 | 71 | 5 | 3 | 54.59% | 45.41% | 5.2473 | 4.7473 | 4.2473 | 12.5543 | 7 | passed | needs_filtering | rolling_window_stability, target_first_rate, invalidation_first_rate |
| ny_open_only | 41 | 26 | 5 | 3 | 53.66% | 46.34% | 3.8062 | 3.3062 | 2.8062 | 9.2133 | 4 | degraded | rejected | rolling_window_stability, target_first_rate, invalidation_first_rate, oos_verdict |
| ny_open_shorts | 21 | 15 | 5 | 3 | 52.38% | 47.62% | 3.0443 | 2.5443 | 2.0443 | 7.3931 | 3 | passed | needs_filtering | rolling_window_stability, target_first_rate, invalidation_first_rate |
| medium_ifvg_clean_retest | 4 | 4 | 5 | 3 | 50.00% | 50.00% | 1.3972 | 0.8972 | 0.3972 | 3.7944 | 1 | insufficient_data | insufficient_data | candidate_count, rolling_window_stability, target_first_rate, invalidation_first_rate |
| london_open_shorts | 22 | 17 | 5 | 4 | 40.91% | 59.09% | 2.6754 | 2.1754 | 1.6754 | 5.5277 | 4 | degraded | rejected | rolling_window_stability, target_first_rate, invalidation_first_rate, oos_verdict |
| large_ifvg | 0 | 0 | 0 | 0 | 0.00% | 0.00% | 0 | 0 | 0 | 0 | 0 | insufficient_data | too_strict | candidate_count, unique_trading_dates, active_rolling_windows, target_first_rate, half_r_cost_expectancy, one_r_cost_expectancy |

## Passing Variants

- `clean_retest_displacement`: 26 candidates, 76.92% target-first, 19 dates.
- `premium_discount_aligned`: 268 candidates, 72.01% target-first, 64 dates.
- `displacement_confirmation`: 189 candidates, 70.90% target-first, 62 dates.

## Best Blocked Variants

- `medium_ifvg`: 64.86% target-first, 35.14% invalidation-first, 37 candidates, failed gates: rolling_window_stability, invalidation_first_rate
- `medium_ifvg_htf_aligned`: 63.64% target-first, 36.36% invalidation-first, 22 candidates, failed gates: rolling_window_stability, invalidation_first_rate

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
