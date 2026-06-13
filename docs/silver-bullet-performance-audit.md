# Silver Bullet 90-Day Performance Audit

Date: 2026-06-13

## Scope

This audit evaluates the research-only `silver_bullet_v1` detector against explicit 90-day MT5 read-only history.

Safety boundaries remained unchanged:

- No broker execution
- No live trading
- No order placement
- No MT5 mutation
- No readiness override
- No OpenClaw auto-apply
- Authority: `executionAuthority none`, `brokerAuthority none`, `readinessOverrideAuthority none`

Raw candles were used internally by the diagnostic script only. The report excludes raw candles, snapshots, secrets, account data, order data, and position data.

## Data Status

Source: MT5 read-only CFD/proxy data

Requested symbol: `MNQ`

Broker symbol: `USTECH`

Primary timeframe: `1m`

Context timeframes: `5m`, `15m`

Requested lookback: 90 days

| Timeframe | Candles | Lookback | Chunks | Status |
|---|---:|---:|---:|---|
| 1m | 88,984 | 88.95 days | 30 | sufficient |
| 5m | 17,799 | 88.95 days | 30 | sufficient |
| 15m | 5,933 | 88.95 days | 30 | sufficient |

USTECH is a CFD/proxy source for requested MNQ, not CME futures truth.

## Detector Funnel

| Step | Count |
|---|---:|
| Session evaluations | 11,640 |
| Detected sweeps | 10,009 |
| FVG-after-sweep cases | 7,815 |
| Return-to-FVG entries | 5,909 |
| Valid candidates | 152 |
| No-trade evaluations | 6,040 |
| Insufficient data | 0 |

Most common blockers:

| Blocker | Count |
|---|---:|
| No directional FVG formed after the liquidity sweep. | 2,194 |
| Price has not returned to the Silver Bullet FVG entry zone. | 1,906 |
| No qualifying liquidity sweep found in the active Silver Bullet window. | 1,631 |
| RR below 2R variants | 215+ |

## Performance Summary

| Metric | Result |
|---|---:|
| Valid candidates | 152 |
| Target-first | 16 |
| Invalidation-first | 132 |
| Stalled | 4 |
| Target-first rate | 10.53% |
| Invalidation-first rate | 86.84% |
| Average RR | 92.6542 |
| Median RR | 21.8433 |
| Unique trading dates | 63 |

The RR values are not actionable as positive evidence because the target-first rate is very low and invalidation-first outcomes dominate.

## Session Breakdown

| Session | Count | Target-first | Invalidation-first | Average RR |
|---|---:|---:|---:|---:|
| London open | 54 | 7.41% | 92.59% | 81.1775 |
| New York AM | 50 | 16.00% | 80.00% | 95.1994 |
| New York PM | 48 | 8.33% | 87.50% | 102.9143 |

New York AM is the best of the three sessions, but it remains well below paper-watchlist quality.

## Side Breakdown

| Side | Count | Target-first | Invalidation-first | Average RR |
|---|---:|---:|---:|---:|
| Long | 58 | 15.52% | 82.76% | 51.4133 |
| Short | 94 | 7.45% | 89.36% | 118.1008 |

Long candidates were less poor than short candidates, but neither side has a research edge in this configuration.

## Rolling / OOS Result

OOS verdict: `degraded`

| Split | Count | Target-first | Invalidation-first | Average RR |
|---|---:|---:|---:|---:|
| First half | 76 | 14.47% | 81.58% | 101.4355 |
| Second half | 76 | 6.58% | 92.11% | 83.8730 |

Rolling windows:

| Window | Dates | Count | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
| 1 | 2026-03-16 to 2026-04-15 | 48 | 16.67% | 81.25% |
| 2 | 2026-03-31 to 2026-04-30 | 47 | 17.02% | 78.72% |
| 3 | 2026-04-15 to 2026-05-15 | 53 | 9.43% | 86.79% |
| 4 | 2026-04-30 to 2026-05-30 | 54 | 7.41% | 92.59% |

The detector has independent-date coverage, but performance is consistently weak and degrades over time.

## Gate Decision

| Gate | Result |
|---|---|
| Minimum unique dates >= 3 | pass |
| Active rolling windows >= 2 | pass |
| Valid candidates >= 20 | pass |
| Minimum RR >= 2 | pass on raw RR, not useful due outcome quality |
| No mock/sample source | pass |
| OOS degradation blocks promotion | fail |

Robustness classification: `rejected`

Promotion decision: keep `silver_bullet_v1` research-only / replay-required. Do not promote to `paper_watchlist_candidate`, Paper-Demo Candidate, or any execution-adjacent state.

## Recommended Follow-Up

- Do not broaden this detector.
- Review why stop placement creates very large RR while invalidation-first dominates.
- Test stricter post-FVG displacement and return quality filters before any future replay.
- Evaluate session-specific variants only after the base detector improves; New York AM is the least weak segment but still not paper-ready.
- Keep OpenClaw/advisory output explanatory only; no readiness or calibration apply authority.
