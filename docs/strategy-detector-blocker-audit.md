# Strategy Detector Blocker Audit

Date: 2026-06-13

Scope: research diagnostics only. No broker execution, live trading, order placement, MT5 mutation, account/order/position access, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion was added.

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

The audit uses compact outputs from explicit MT5 read-only diagnostics. Raw candles remain internal and are not written to this report.

## Executive Finding

GoTrader is not blocked by one single missing switch. The current strategy funnel has three different failure modes:

1. `ict_cmd_short_paper_watchlist_v1` has the best positive paper-only behavior, but its evidence is concentrated on one trading date and one rolling window.
2. `silver_bullet_v1` is too broad and shows no replay edge.
3. `silver_bullet_v2_refined_research` and `turtle_soup_v1` are intentionally strict, but currently produce too little evidence for promotion.

The safest next refinement is not a broad threshold loosening. The next best work is:

- keep CMD paper-only and collect independent dates,
- audit Turtle Soup setup-range definition before touching rejection/MSS/RR rules,
- keep Silver Bullet v2 strict and optionally test a research-only NY AM sub-variant later.

## Source

Primary source:

- Provider: `mt5_read_only`
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Lookback: explicit 90-day read-only history
- 5m depth: 17,799 candles, 88.95 days
- 1m depth: 88,984 candles, 88.95 days
- Instrument caveat: `USTECH` is MT5 CFD/proxy data for requested `MNQ`, not CME futures truth.

## Strategy Summary

| Strategy | Status | Evaluated | Valid | Target-First | Invalidation-First | Dates | Windows | OOS/Robustness |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `ict_cmd_short_paper_watchlist_v1` | `promising_but_unstable` | 1,920 | 8 | 87.50% | 12.50% | 1 | 1 | `overfit_risk` |
| `silver_bullet_v1` | `no_edge` | 11,640 | 152 | 10.53% | 86.84% | 63 | 4 | `degraded` |
| `silver_bullet_v2_refined_research` | `insufficient_data` | 11,640 | 3 | 33.33% | 66.67% | 3 | 3 | `insufficient_data` |
| `turtle_soup_v1` | `too_strict` | 2,730 | 0 | 0.00% | 0.00% | 0 | 0 | `insufficient_data` |
| `cisd_v1` | `ready_for_more_validation` | 0 | 0 | 0.00% | 0.00% | 0 | 0 | dedicated CISD diagnostic now available |
| `ifvg_research_v1` | `insufficient_data` | 0 | 0 | 0.00% | 0.00% | 0 | 0 | detector not implemented |
| `ote_research_v1` | `insufficient_data` | 0 | 0 | 0.00% | 0.00% | 0 | 0 | detector not implemented |
| `market_map_only_diagnostic_v1` | `no_edge` | 0 | 0 | 0.00% | 0.00% | 0 | 0 | diagnostic only |

## CMD Paper-Watchlist

`ict_cmd_short_paper_watchlist_v1` remains the strongest positive lane, but it is not stable enough for promotion.

Metrics:

- Total replay signals: 1,920
- CMD research candidates: 162
- CMD paper-watchlist candidates: 8
- Target-first rate: 87.50%
- Invalidation-first rate: 12.50%
- Average RR: 3.3612
- Median RR: 2.635
- Candidate trading dates: 1
- Active rolling windows: 1
- Robustness: `overfit_risk`

Blocker distribution:

| Blocker | Count |
| --- | ---: |
| CMD rejected/no-trade candidates did not pass strict paper-watchlist gates | 1,909 |
| CMD lane is promising but date-concentrated; needs independent-date validation | 8 |

Diagnosis:

CMD is promising, but every strict paper-watchlist candidate is concentrated on `2026-06-12`. The missing condition is independent-date validation:

- required unique trading dates: at least 3
- current unique trading dates: 1
- required active rolling windows: at least 2
- current active rolling windows: 1
- required candidate count: at least 20
- current candidate count: 8

Decision: keep CMD paper-only; do not promote to approved or Paper-Demo.

## Silver Bullet v1

`silver_bullet_v1` is useful only as a rejected baseline.

Funnel:

- Evaluated Silver Bullet windows: 11,640
- Detected sweeps: 10,009
- FVG-after-sweep cases: 7,815
- Return-to-FVG entries: 5,909
- Valid candidates: 152
- Target-first rate: 10.53%
- Invalidation-first rate: 86.84%
- OOS verdict: `degraded`

Top blockers:

| Blocker | Count |
| --- | ---: |
| No directional FVG formed after the liquidity sweep | 2,194 |
| Price has not returned to the Silver Bullet FVG entry zone | 1,906 |
| No qualifying liquidity sweep found in the active Silver Bullet window | 1,631 |
| RR below 2R variants | 215 |

Diagnosis:

V1 is too broad. It detects many candidate structures, but the replay edge is poor. The issue is not missing targets or invalidations; it is weak edge and poor OOS behavior.

Decision: keep rejected/research-only baseline.

## Silver Bullet v2

`silver_bullet_v2_refined_research` correctly removes weak V1 setups, but the current sample is too small.

Funnel:

- Evaluated windows: 11,640
- V1 valid candidates: 152
- V2 valid candidates: 3
- Candidate reduction: 98.03%
- Target-first rate: 33.33%
- Invalidation-first rate: 66.67%
- Unique trading dates: 3
- Active rolling windows: 3
- OOS verdict: `insufficient_data`

Top blockers:

| Blocker | Count |
| --- | ---: |
| No meaningful prior swing/equal high-low sweep in the first half of the window | 6,085 |
| 5m/15m context does not align with Silver Bullet direction | 4,060 |
| No timely directional FVG with meaningful displacement within five candles after sweep | 1,241 |
| No timely return to refined FVG entry zone within ten candles | 179 |

Diagnosis:

V2 is not obviously “wrong.” The strict filters remove the weak V1 population that produced poor results. The problem is sample size. NY AM produced 2 of the 3 candidates and is the only plausible sub-variant worth researching.

Decision: keep V2 strict and replay-required. Do not promote.

## Turtle Soup v1

`turtle_soup_v1` is currently too strict or mismatched to the active USTECH 15m setup-range definition.

Funnel:

- Evaluated windows: 2,730
- Valid candidates: 0
- Unique trading dates: 0
- OOS verdict: `insufficient_data`

Top blockers:

| Blocker | Count |
| --- | ---: |
| No fresh sweep of the setup range high/low | 2,719 |
| No immediate 1-3 candle rejection after Turtle Soup sweep | 11 |

Diagnosis:

The failure is almost entirely at the setup-range sweep gate. It is not primarily RR failure, stale sweep, target/invalidation construction, or high-impact news. This points to either:

- the setup range definition is too narrow,
- the 15m setup context is not matching USTECH CFD/proxy session behavior,
- or the current 90-day window simply did not provide the required Turtle Soup pattern.

Recommended next step:

Add a diagnostic-only alternate setup-range definition and compare blocker movement. Do not loosen rejection, MSS, or RR until the setup-range problem is understood.

Decision: keep Turtle Soup research-only/replay-required.

## Placeholder And Diagnostic Strategies

`ifvg_research_v1` and `ote_research_v1` are registered, but they do not yet have deterministic executable detectors. Their current “zero candidates” result is not strategy failure; it is missing implementation. `cisd_v1` has since been implemented as an executable research detector and should be reviewed through `docs/cisd-performance-audit.md`.

Required next implementation before performance measurement:

- CISD: use `test:cisd-performance` as the baseline; v1 is executable research but rejected by current 90-day replay/OOS outcomes.
- IFVG: define deterministic invalidated-FVG, inversion retest, and displacement rules.
- OTE: define no-hindsight swing selection, retracement zone, and PD-array confluence.

`market_map_only_diagnostic_v1` is context-only. It should never produce target/invalidation/RR or Paper-Demo eligibility.

## Final Recommendation

1. **CMD:** continue paper-only tracking, but block all promotion until independent-date validation passes.
2. **Turtle Soup:** investigate setup-range definition first. This has the clearest “zero candidate” blocker.
3. **Silver Bullet v2:** keep strict; consider a separate NY AM-only diagnostic only after more samples are collected.
4. **Silver Bullet v1:** keep rejected baseline.
5. **CISD/IFVG/OTE:** implement first-class deterministic contracts before claiming performance failure.
6. **Market map:** keep diagnostic only.

No strategy is ready for Paper-Demo promotion from this audit.

## Safety Result

The audit output remained compact:

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no order placement
- no readiness override
- authority `none/none/none`
