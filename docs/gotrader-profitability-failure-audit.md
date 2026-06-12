# GoTrader Profitability Failure Audit

Generated: 2026-06-12  
Scope: research diagnostics only. No broker execution, live trading, order placement, MT5 mutation, account/order/position access, readiness override, OpenClaw auto-apply, or calibration apply was added.

## Executive Finding

GoTrader is not failing because MT5 data is unavailable or because ICT model recognition is absent. The current failure mode is a funnel problem:

1. Broad/raw recognition produces too many low-quality or non-directional signals.
2. Current live Grinch reversal calibration remains blocked by timing/clean-expansion evidence.
3. Approved and paper-watchlist lanes can show positive target-first behavior, but the strongest recent CMD paper-watchlist evidence is concentrated on one trading date and is therefore not stable enough for promotion.
4. Several profitability diagnostic scripts had stale generated-module dependency lists, so deeper replay/OOS diagnostics were failing before they could answer the strategy question.

No strategy thresholds were loosened. No candidate was promoted. Authority remains `none/none/none`.

## Data And Source Status

MT5 read-only is live and reachable through the GoTrader wrapper.

| Check | Result |
| --- | --- |
| Provider | `mt5_read_only` |
| Requested symbol | `MNQ` |
| Broker symbol | `USTECH` |
| Timeframe | `5m` |
| Latest candles | 1000 current candles returned |
| Wrapper mode | `live` |
| Upstream | `http://127.0.0.1:8000` |
| Latest endpoint | available |
| Range endpoint | available |
| Authority | `executionAuthority none`, `brokerAuthority none`, `readinessOverrideAuthority none` |

Depth is adequate only through the explicit 90-day chunked path. The default/latest candle path remains a short current-window path and should not be used as the profitability evidence base.

| Depth Path | Result |
| --- | --- |
| Latest/single window | 5000 candles, about 24.27 days, limited for 90-day calibration |
| Explicit chunked 90-day history | 17,799 candles, 9 chunks, 88.95 days, sufficient |
| 15m session narrative 90-day scan | 5,933 candles, 65 trading days evaluated |

Important source caveat: `USTECH` remains MT5 read-only CFD/proxy data for requested `MNQ`, not CME MNQ futures truth. This is suitable for research diagnostics only.

## Recognition Quality

Recognition is working, but most recognized contexts are not tradable setups.

The 90-day session narrative scan found:

| Session Narrative | Count |
| --- | ---: |
| `range_bound` | 42 |
| `accumulation_manipulation_expansion` | 16 |
| `consolidation_manipulation_distribution` | 6 |
| `ny_session_reversal_to_premium_fvg` | 1 |
| `ny_session_reversal_from_premium_to_discount` | 0 |
| `trend_continuation` | 0 |
| `low_probability` | 4 |

The model-fidelity audit confirms many concepts are implemented and wired, including Asia range, London sweep, 12AM open reclaim/rejection, NY sweep/reversal, premium/discount, dealing range, FVG targets/entries, liquidity sweeps, order blocks, breaker blocks, displacement, consolidation, expansion, and reversal profiles.

Remaining model-fidelity gaps:

- Dedicated 3AM London behavior is only partially modeled.
- NY continuation/distribution exists through CMD/AME, but `trend_continuation` is mostly label-level.
- Market structure shift is partial, not a first-class suite contract.
- Low resistance liquidity run is missing.
- Seek-and-destroy profile is missing.
- Full named Grinch Model 1, Grinch reversal, and Grinch consolidation contracts are not first-class inside ICT Strategy Suite model detections.
- ICT 2022 named model contracts are partial rather than explicit.

## Signal Funnel Findings

Different diagnostics use different replay budgets, but the funnel pattern is consistent.

### Raw/Broad Replay

`test:ict-real-replay-runner` against live MT5 current-window data:

| Metric | Result |
| --- | ---: |
| Total signals | 7,368 |
| Target-first rate | 8.62% |
| Average R achieved | 5.62 |

This is the clearest broad-profitability failure: raw signal generation is very noisy and cannot be treated as an actionable lane.

### 90-Day Candidate Structure

`test:ict-target-invalidation-rr-audit`:

| Metric | Result |
| --- | ---: |
| Detected models | 960 |
| Research candidates | 98 |
| Approved candidates | 2 |
| Paper-watchlist candidates | 7 |
| Watchlist candidates | 14 |
| Missing target | 0 |
| Missing invalidation | 0 |
| Missing RR | 0 |
| False research-only blockers | 0 |

Target, invalidation, and RR construction is no longer the primary blocker. The remaining issue is quality selection, not missing candidate fields.

### Watchlist Quality

`test:ict-watchlist-quality-diagnostic`:

| Lane | Count | Target-First | Invalidation-First | Average RR |
| --- | ---: | ---: | ---: | ---: |
| Approved | 26 | 84.62% | 15.38% | 4.0173 |
| Watchlist | 199 | 74.37% | 17.59% | 4.1404 |
| Rejected | 742 | 78.30% | 16.98% | 2.7756 |
| Paper-only eligible subset | 10 | 90.00% | 10.00% | 3.043 |

The high target-first rate in rejected candidates is not enough to loosen gates. Rejected candidates are rejected mostly for hard quality reasons:

| Hard Blocker | Count |
| --- | ---: |
| `target_quality` | 512 |
| `smt_rejects_candidate` | 168 |
| `contradictory_session_or_bias` | 110 |
| `missing_displacement_or_sweep` | 75 |
| `equilibrium_context` | 25 |
| `no_liquidity_objective` | 19 |

Top rejection reasons include target too close, no displacement evidence, session narrative contradiction, equilibrium, missing external liquidity target, and SMT rejection.

## CMD Paper-Watchlist Finding

The strongest positive lane is CMD paper-watchlist, but it is not stable enough yet.

`test:ict-paper-watchlist-performance`:

| Metric | Result |
| --- | ---: |
| Paper-watchlist candidates | 8 |
| Target-first rate | 87.50% |
| Invalidation-first rate | 12.50% |
| Average RR | 2.7475 |
| Median RR | 2.14 |
| Monte Carlo | moderate |
| Model | `consolidation_manipulation_distribution` |
| Side | short |
| Trading dates | 1 date only: 2026-06-12 |

`test:ict-cmd-paper-watchlist-oos`:

| Metric | Result |
| --- | ---: |
| CMD detected models | 9,224 |
| CMD research candidates | 816 |
| CMD paper-watchlist candidates | 8 |
| Rolling windows | 5 |
| Active rolling windows | 1 |
| Unique candidate trading dates | 1 |
| Robustness classification | `overfit_risk` |

Conclusion: CMD should remain paper-watchlist only. It is suitable for continued paper-only tracking, but not ready for approval or execution. The model should be narrowed/tagged by the specific conditions that produced the 2026-06-12 cluster, then retested over independent dates.

## Current Live Grinch/Reversal Finding

`test:auto-research-candidate` on the active 1000-candle MT5 window:

| Metric | Baseline |
| --- | ---: |
| Trades | 6 |
| Win rate | 0% |
| Average R | -0.01 |
| Drawdown | 0.09 |
| Profit factor | 0 |
| Grinch profile | none |
| Hard gate | `grinch_timing_expired` |

The `reversal_expansion_confirmation` strict/balanced/exploratory variants remain research-only and are not promotable. The current replay diagnostic shows:

- 12AM Open resolved exactly at New York midnight.
- Sunday Open is unavailable in the active 1000-candle window.
- London did not interact with 12AM Open in the expected way.
- Expansion distance passed, but clean-side maintenance failed.
- Failure rule: `clean_side_violation`.
- Recommendation: keep the setup blocked; use timing sensitivity only as research evidence.

This explains why the live Advisor can still show no approved idea even when the broader 90-day scan finds some paper-watchlist promise.

## Why GoTrader Is Not Producing Positive Research Results Yet

1. **The broad signal layer is not profitable.** The live raw replay target-first rate is only 8.62%. This layer must stay diagnostic.
2. **The profitable-looking lane is tiny.** CMD paper-watchlist is strong on paper but only has 8-10 examples and is concentrated on one date.
3. **Range-bound and market-map contexts dominate.** Many days produce structure, but not directional trade ideas.
4. **Quality gates are doing useful work.** The approved and paper-only subsets perform much better than raw signals, but still lack stable OOS coverage.
5. **Current-window Grinch reversal is legitimately blocked.** Timing/clean-expansion evidence does not support the current setup.
6. **Named model contracts are incomplete.** Several user-recognized models still need first-class deterministic contracts before GoTrader can reliably identify and score them.
7. **Some diagnostics were stale.** Several generated-module test harnesses were missing newer ICT suite dependencies, blocking profitability diagnosis until repaired.

## Safe Fixes Applied

Only diagnostic harness fixes were applied. Strategy thresholds, readiness gates, execution paths, broker access, and OpenClaw behavior were not changed.

Updated diagnostic harnesses to include current ICT suite dependencies:

- `scripts/test-ict-real-replay-runner.mjs`
- `scripts/test-ict-approved-setup-profile.mjs`
- `scripts/test-ict-replay-diagnostics.mjs`
- `scripts/test-ict-target-invalidation-rr-audit.mjs`
- `scripts/test-ict-paper-watchlist-performance.mjs`
- `scripts/test-ict-cmd-paper-watchlist-oos.mjs`
- `scripts/test-ict-watchlist-quality-diagnostic.mjs`
- `scripts/test-ict-market-scorecard.mjs`
- `scripts/test-ict-approved-outcome-calibration.mjs`
- `scripts/test-ict-out-of-sample-validation.mjs`

These fixes restore the profitability diagnostics after the newer market-analysis, opportunity-detection, universal-recognition, self-improvement, hypothesis-validation, and CMD paper-tracking modules were added.

## Recommended Next Work

1. Keep CMD paper-watchlist as paper-only and require independent dates before any status change.
2. Add first-class deterministic contracts for the missing/partial model families:
   - low resistance liquidity run
   - seek-and-destroy
   - full Grinch Model 1
   - full Grinch reversal
   - full Grinch consolidation
   - explicit ICT 2022 named models
3. Add a current-session Sunday Open / weekly reference fallback for short active windows, but only as diagnostics unless validated.
4. Run longer OOS/calibration jobs outside the short interactive cap and save compact summaries.
5. Keep range-bound no-trade unless it has explicit reversal/expansion evidence.
6. Continue using the explicit 90-day chunked path for profitability diagnostics; do not infer profitability from the 1000-candle dashboard/current path.

## Safety Result

All audited outputs remained compact and research-only:

- No raw candles were exposed in reports, advisor packets, journals, OpenClaw packets, or UI payloads.
- No secrets were exposed.
- No account/order/position data was added.
- No broker mutation path was added.
- No order placement path was added.
- No readiness override was added.
- No auto-apply path was added.
- Authority remained `executionAuthority: none`, `brokerAuthority: none`, `readinessOverrideAuthority: none`.

