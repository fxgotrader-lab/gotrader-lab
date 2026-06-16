# Session Raid Reversal 90-Day Evidence Audit

Date: 2026-06-16

## Scope

This audit checks whether `nasdaq_london_raid_ny_reversal_v1` has enough compact evidence across explicit 90-day MT5 read-only USTECH history for replay and walk-forward validation.

Safety boundary:
- Source is MT5 read-only CFD/proxy data.
- Requested label is MNQ-style research using broker symbol USTECH.
- Raw candles stay internal to the CLI diagnostic.
- No broker execution, order placement, account/order/position access, readiness override, OpenClaw auto-apply, or Paper-Demo promotion is introduced.
- Authority remains `executionAuthority: none`, `brokerAuthority: none`, `readinessOverrideAuthority: none`.

## Source Depth

The diagnostic used GoTrader MT5 wrapper `http://127.0.0.1:7341` with live upstream status.

| Item | Result |
| --- | --- |
| Source provider | `mt5_read_only` |
| Requested symbol | `MNQ` |
| Broker symbol | `USTECH` |
| 5m candles | 17,524 |
| 5m lookback | 90.00 days |
| 5m chunks | 9 / 9 completed |
| 15m candles | 5,842 |
| 15m lookback | 90.00 days |
| 15m chunks | 9 / 9 completed |
| Data depth status | sufficient |
| Range endpoint | available |

## Candidate Counts

The model was evaluated once per New York trading date using compact MT5-derived session references.

| Metric | Count |
| --- | ---: |
| Trading dates available | 65 |
| Days scanned | 64 |
| Candidate-like narrative rows | 64 |
| Complete bearish reversal candidates | 12 |
| Complete candidate dates | 12 |
| Replay-ready complete candidates | 12 |
| Target-first compact replay outcomes | 3 |
| Invalidation-first compact replay outcomes | 9 |

Status distribution:

| Status | Count |
| --- | ---: |
| `forming` | 32 |
| `near_miss` | 20 |
| `complete_bearish_reversal_candidate` | 12 |

Complete candidate dates:

`2026-03-30`, `2026-04-06`, `2026-04-20`, `2026-04-21`, `2026-05-06`, `2026-05-13`, `2026-05-20`, `2026-05-29`, `2026-06-02`, `2026-06-03`, `2026-06-11`, `2026-06-16`.

## Step Telemetry

| Condition | Present Count |
| --- | ---: |
| Asia consolidation | 60 |
| London expansion | 47 |
| Asia high sweep | 45 |
| Prior-day high sweep | 21 |
| London high created | 64 |
| NY London high raid | 41 |
| Bearish MSS | 30 |
| Breaker | 30 |
| FVG | 27 |
| FVG retrace | 24 |
| Sell-side delivery | 13 |
| Sunday Open resolved | 62 |
| Premium to Sunday Open | 49 |
| Valid RR >= 2 | 24 |

Most common missing conditions:

| Missing Condition | Count |
| --- | ---: |
| `sell_side_delivery` | 51 |
| `prior_day_high_sweep` | 43 |
| `fvg_retrace` | 40 |
| `invalidation_missing` | 40 |
| `fvg_detected` | 37 |
| `bearish_mss` | 34 |
| `breaker_detected` | 34 |
| `ny_london_high_raid` | 23 |

## Replay Readiness

The complete candidates were replay-checked using compact target/invalidation-first logic after the FVG retrace anchor.

| Outcome | Count |
| --- | ---: |
| `target_first` | 3 |
| `invalidation_first` | 9 |

The target-first rate among complete candidates is 25.00%. That is not sufficient evidence for walk-forward progression.

## Walk-Forward Preflight

Walk-forward preflight used the same MT5 90-day source fingerprint and the compact replay-passed count.

| Requirement | Actual | Required |
| --- | ---: | ---: |
| Replay-passed candidates | 3 | 20 |
| Candidate count for walk-forward | 3 | 20 |
| Unique trading dates in source | 65 | 3 |
| Rolling windows possible | 5 | 3 |
| Estimated OOS trades | 3 | 20 |

Preflight verdict: `blocked`.

Blockers:
- Replay has only 3 candidate(s); 20 are required before walk-forward can judge strategy quality.
- Replay-passed candidate count is 3/20.

Next action from preflight:
`Collect more replay candidates or narrow the strategy only after more MT5 history confirms the setup.`

## Strictness Assessment

The detector is not blocked by source depth or date independence. MT5 range history is sufficient, and complete candidates appear on 12 independent trading dates.

The blocker is replay quality and replay-passed count, not walk-forward configuration. The model recognizes the sequence often enough to study, but the current complete-candidate lane is not yet profitable enough for OOS or Paper-Demo progression.

Assessment: `properly_selective_until_more_replay_evidence`.

## Recommended Adjustment

Do not loosen production thresholds in this task.

Recommended next research work:
- Keep the strict detector as-is.
- Build a separate research-only replay refinement that analyzes why 9 of 12 complete candidates hit invalidation first.
- Prioritize FVG retrace quality, invalidation placement, and sell-side delivery timing.
- Consider a future relaxed variant only as a research-only branch, and require it to improve target-first outcomes across independent dates.
- Do not run walk-forward until replay-passed candidates reach at least 20.

Promotion decision: no Paper-Demo promotion, no readiness promotion, no execution path.

## CLI

Run:

```powershell
npm.cmd run test:session-raid-reversal-evidence-depth
```

The script emits compact JSON only and verifies:
- no raw candle arrays are serialized,
- no secrets/account/order/position data are serialized,
- authority remains none/none/none.
