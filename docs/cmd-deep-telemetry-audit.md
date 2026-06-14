# CMD Deep Telemetry Audit

Generated: 2026-06-14T08:26:41.752Z

Scope: research telemetry and variant discovery only. No broker execution, live trading, order placement, MT5 mutation, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion was added.

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

Raw candles remain internal to the replay harness and are not written to this report.

## Data Depth

- Provider: `mt5_read_only`
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Timeframe: `5m`
- Compact candles evaluated internally: 17799
- Available lookback: 88.95 days
- Completed chunks: 9
- Replay windows evaluated: 240
- Replay budget note: The diagnostic fetches explicit 90-day MT5 range history, then evaluates the capped latest replay-window budget for interactive safety. Increase ICT_CMD_TELEMETRY_MAX_WINDOWS for a slower deeper sweep.

## Winning CMD Cluster Summary

- Paper-watchlist candidates: 8
- Winners: 7
- Target-first: 87.50%
- Invalidation-first: 12.50%
- Unique dates: 1
- Active rolling windows: 1
- Repeatability classification: `overfit_risk`
- Top sessions: `{"new_york_lunch":4,"new_york_pm":3,"asia":1}`
- HTF alignment: `{"aligned":8}`
- FVG respected: `{"false":8}`
- Sweep quality: `{"strong":8}`
- Manipulation depth: `{"extreme":3,"medium":3,"low":2}`

## Losing CMD Comparison

- Losing/filtered CMD telemetry rows: 1913
- Loser target-first: 16.52%
- Loser invalidation-first: 9.10%

| Feature | Winners | Losers | Note |
| --- | ---: | ---: | --- |
| fvg_respected | 0 | 0.0653 | Compares whether FVG return/respect is actually differentiating winners from filtered or losing CMD candidates. |
| external_liquidity_target_present | 1 | 1 | CMD paper-watchlist already requires this context; telemetry checks whether losers lacked the same quality. |
| average_displacement_score | 10.0321 | 3.4125 | Displacement is normalized by compact risk distance, not by raw candle arrays. |
| htf_aligned_share | 1 | 0.3095 | Shows whether the winning CMD cluster needed HTF support or worked as a lower-timeframe paper idea. |
| smt_confirmed_share | 0.8571 | 0.1746 | SMT is optional; this highlights whether it is worth making a separate candidate family. |

## Variant Discovery

| Variant | Candidates | Target-first | Invalidation-first | Avg RR | Median RR | Dates | Windows | Classification | Next action |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `cmd_short_high_displacement_fvg_respected` | 9 | 100.00% | 0.00% | 2.1422 | 2.0700 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |
| `cmd_short_clean_expansion` | 50 | 88.00% | 4.00% | 2.3378 | 1.8700 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |
| `cmd_short_smt_confirmed` | 53 | 84.91% | 11.32% | 1.5438 | 1.2900 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |
| `cmd_short_external_liquidity_target` | 68 | 79.41% | 14.71% | 1.8287 | 1.2950 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |
| `cmd_short_htf_aligned` | 68 | 79.41% | 14.71% | 1.8287 | 1.2950 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |
| `cmd_short_strong_sweep_quality` | 68 | 79.41% | 14.71% | 1.8287 | 1.2950 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |
| `cmd_short_ny_session_only` | 33 | 78.79% | 21.21% | 1.8855 | 1.2900 | 1 | 1 | overfit_risk | Search for the same compact signature on independent dates before adding an executable variant. |

## Independent-Date Availability

Similar-feature candidates found on 1 trading date(s).

CMD remains blocked because the strongest feature signature is still date-concentrated.

## Recommendation

Best next variant candidate: `cmd_short_high_displacement_fvg_respected`. Keep it research-only and run a dedicated executable-variant diagnostic with independent-date gates.

Do not promote CMD to Paper-Demo or approved status from this audit.

## Next Standalone Detector Recommendation: IFVG

CMD remains date-concentrated, so the next standalone detector should be IFVG v1 rather than another CMD promotion attempt.

IFVG v1 plan:

- Timeframe: `5m` or `15m`.
- Identify a fair value gap that is fully traded through.
- Former bearish FVG becomes bullish support for a long candidate.
- Former bullish FVG becomes bearish resistance for a short candidate.
- Entry: 50% of the inverted FVG zone.
- Stop: beyond the IFVG boundary.
- Target: next draw on liquidity.
- Minimum RR: `2R`.
- Block reused IFVG zones.
- Block against HTF trend.
- Block low-volume sessions.
- Block mock/sample sources.
- Require replay, walk-forward, independent-date, and OOS validation before any Paper-Demo progression.
