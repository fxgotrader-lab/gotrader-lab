# Session Raid Reversal Winner/Loser Audit

Date: 2026-06-16

## Scope

This audit analyzes the 12 complete `nasdaq_london_raid_ny_reversal_v1` candidates found across explicit 90-day MT5 read-only USTECH history for MNQ-style research.

Safety boundary:
- Source is MT5 read-only CFD/proxy data.
- Requested label is MNQ-style research using broker symbol USTECH.
- Raw market bars stay internal to the CLI diagnostic.
- No broker execution, order placement, account/order/position access, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion is introduced.
- Authority remains `executionAuthority: none`, `brokerAuthority: none`, `readinessOverrideAuthority: none`.

## Source Depth

| Item | Result |
| --- | --- |
| Source provider | `mt5_read_only` |
| Requested symbol | `MNQ` |
| Broker symbol | `USTECH` |
| 5m compact bars | 17,524 |
| 5m lookback | 90.00 days |
| 5m chunks | 9 / 9 completed |
| 15m compact bars | 5,841 |
| 15m lookback | 89.95 days |
| 15m chunks | 9 / 9 completed |
| Data depth status | sufficient |
| Range endpoint | available |

## Candidate Outcome Summary

| Metric | Result |
| --- | ---: |
| Trading days scanned | 64 |
| Complete candidates | 12 |
| Target-first winners | 3 |
| Invalidation-first losers | 9 |
| Partial / stalled / insufficient future data | 0 |
| Target-first rate | 25.00% |
| Walk-forward status | blocked, only 3 target-first outcomes vs 20 required |

Winner dates:

`2026-03-30`, `2026-04-21`, `2026-06-16`.

Loser dates:

`2026-04-06`, `2026-04-20`, `2026-05-06`, `2026-05-13`, `2026-05-20`, `2026-05-29`, `2026-06-02`, `2026-06-03`, `2026-06-11`.

## Winner Versus Loser Comparison

| Feature | Winners | Losers | Read |
| --- | ---: | ---: | --- |
| Average raid distance above London High | 39.29 | 88.18 | Bigger raids did not help. |
| Median raid distance above London High | 47.30 | 81.30 | Losers were often more extended. |
| Average displacement body size | 38.32 | 27.22 | Winners had stronger bearish body confirmation. |
| Average FVG size | 50.92 | 11.48 | Winners had materially larger post-MSS FVGs. |
| Median FVG size | 51.09 | 6.69 | Tiny FVGs were a major loser cluster. |
| Average RR | 3.19 | 4.50 | Higher RR did not imply better quality. |
| Average stop distance | 44.71 | 36.39 | Very tight structures often failed first. |
| Average target distance | 126.44 | 143.98 | Losers asked for more follow-through. |
| Average FVG retrace depth | 0.5548 | 0.8230 | Losers often retraced deeply into/through the FVG. |
| Median retrace depth | 0.35 | 1.00 | Full-depth mitigations were weak. |
| Session distribution | 3 NY open | 9 NY open | Time window did not separate outcomes. |
| Premium/discount distribution | 2 premium, 1 discount | 9 premium | Premium to Sunday Open alone did not help. |
| HTF bias | unknown | unknown | Not yet available to this audit path. |

Strongest separators by median difference:

| Separator | Winner Median | Loser Median | Delta |
| --- | ---: | ---: | ---: |
| Minutes from raid to MSS | 110 | 35 | +75 |
| Raid distance above Asia High | 47.32 | 109.50 | -62.18 |
| Raid distance above prior-day high | 15.74 | -36.29 | +52.03 |
| FVG size | 51.09 | 6.69 | +44.40 |
| Raid distance above London High | 47.30 | 81.30 | -34.00 |
| Stop distance | 53.01 | 38.29 | +14.72 |
| Displacement body size | 35.45 | 22.62 | +12.83 |

Interpretation:
- The model should not simply require a larger London High raid. Losers were often the more overextended raids.
- The useful signal is cleaner displacement and meaningful FVG geometry after the raid, not raw raid size.
- Very small FVGs and full-depth FVG retraces are the clearest failure warnings in this sample.
- RR inflation can be misleading; many high-RR losers failed before downside delivery.

## Failure Modes

| Primary failure mode | Count |
| --- | ---: |
| `weak_displacement` | 6 |
| `fvg_too_small` | 2 |
| `target_too_far` | 1 |

Secondary recurring reasons:
- `fvg_too_small`
- `sell_side_target_too_close_or_wrong`
- `insufficient_downside_followthrough`

The losers were not mostly caused by missing recognition. They were complete candidates whose post-raid delivery quality did not support the trade geometry.

## Filter Variant Tests

These filters are research-only what-if diagnostics. None were applied to the live detector.

| Filter | Retained | Target-First | Invalidation-First | Rate | Unique Dates | Avg RR | Walk-Forward Ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Baseline complete candidates | 12 | 3 | 9 | 25.00% | 12 | 4.1756 | no |
| FVG size within winner range 9.48-92.20 | 6 | 3 | 3 | 50.00% | 6 | 3.2764 | no |
| Displacement body >= winner median 35.45 | 4 | 2 | 2 | 50.00% | 4 | 2.6492 | no |
| Prior-day high and Asia high sweep | 3 | 1 | 2 | 33.33% | 3 | 3.9180 | no |
| Prior-day high or Asia high sweep | 10 | 3 | 7 | 30.00% | 10 | 4.5040 | no |
| Raid distance above London High >= winner min 12.40 | 11 | 3 | 8 | 27.27% | 11 | 4.3117 | no |
| RR >= 2.5 | 10 | 2 | 8 | 20.00% | 10 | 4.5503 | no |
| RR >= 3.0 | 8 | 1 | 7 | 12.50% | 8 | 4.9882 | no |
| Premium to MT5-derived Sunday Open | 11 | 2 | 9 | 18.18% | 11 | 4.2898 | no |
| Target below London Low | 2 | 0 | 2 | 0.00% | 2 | 3.4596 | no |
| Target below Asia Low | 0 | 0 | 0 | 0.00% | 0 | n/a | no |

Best research-only filter candidates:
1. `fvg_size_within_winner_range`: improves target-first to 50%, keeps 6 dates, but still only 3 winners.
2. `displacement_body_gte_winner_median`: also reaches 50%, but retains only 4 candidates.
3. A combined future variant should test meaningful FVG size plus strong displacement, not larger raid distance or higher RR alone.

## Recommendation

Do not loosen the detector.

Do not apply any of these filters to production logic yet.

Recommended next implementation:
- Create a research-only replay refinement variant that scores:
  - post-MSS FVG size floor,
  - displacement body threshold,
  - maximum FVG retrace depth,
  - target feasibility / downside follow-through quality.
- Keep `nasdaq_london_raid_ny_reversal_v1` research-only.
- Do not run walk-forward until replay-passed candidates reach at least 20.
- Do not promote to Paper-Demo; evidence remains insufficient.

Promotion decision: no Paper-Demo promotion, no readiness promotion, no execution path.

## CLI

Run:

```powershell
npm.cmd run test:session-raid-reversal-winner-loser
```

The script emits compact JSON only and verifies:
- no raw candle arrays are serialized,
- no secrets/account/order/position data are serialized,
- authority remains none/none/none.
