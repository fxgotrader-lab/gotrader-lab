# Session Raid Reversal v2 Filtered Research Audit

Date: 2026-06-16

Scope: research-only diagnostic for `nasdaq_london_raid_ny_reversal_v2_filtered_research`.

Safety boundary: no broker execution, no order placement, no MT5 mutation, no readiness override, no OpenClaw auto-apply, no raw candles in output. Authority remains `none/none/none`.

## Purpose

The v1 NASDAQ London Raid -> NY Reversal detector found a plausible model shape but weak replay quality:

- 12 complete v1 candidates over explicit 90-day MT5 USTECH/MNQ history.
- 3 target-first, 9 invalidation-first.
- Target-first rate: 25%.
- Walk-forward blocked because target-first sample is far below the minimum depth.

The winner/loser audit showed that the few winners shared cleaner post-raid geometry. V2 keeps v1 unchanged and adds a separate filtered research layer to test those quality conditions.

## Data

- Source: MT5 read-only.
- Requested symbol: MNQ-style research.
- Broker symbol: USTECH.
- 5m depth: 17,524 compact candles, 90.00 days, sufficient.
- 15m depth: 5,841 compact candles, 89.99 days, sufficient.
- Range endpoint: available.
- Evaluated trading dates: 64.

## V2 Filters

Default threshold set:

| Filter | Value | Rationale |
|---|---:|---|
| Minimum bearish displacement body | 35.45 | Winner median bearish displacement body. |
| Minimum FVG size | 9.48 | Winner minimum FVG size. |
| Maximum FVG size | 92.20 | Winner maximum FVG size. |
| Maximum FVG retrace depth | 0.75 | Avoids deep mitigation/chop-through. |
| Maximum raid distance above London High | 81.30 | Loser median extension cap. |
| Maximum stop distance | 60.00 | Winner stop distance plus tolerance. |
| Minimum target feasibility score | 0.45 | Rejects structurally weak target geometry. |
| High-RR trap cap | RR > 4 requires strong feasibility | Avoids far targets that inflate RR without follow-through evidence. |

## Result

| Lane | Candidates | Target-first | Invalidation-first | Target-first rate | Unique dates | Average RR |
|---|---:|---:|---:|---:|---:|---:|
| v1 baseline | 12 | 3 | 9 | 25.00% | 12 | 4.1756 |
| v2 filtered | 1 | 1 | 0 | 100.00% | 1 | 2.2158 |

V2 retained only the 2026-06-16 candidate. That candidate passed all filters:

- Displacement body: 55.50
- FVG size: 51.09
- FVG retrace depth: 0.35
- Raid distance above London High: 58.16
- Stop distance: 53.01
- Target distance: 117.46
- Target feasibility score: 1.00
- Selected target: London Low
- Outcome: target_first

## Filtered-Out Distribution

Among the 11 complete v1 candidates filtered out by v2:

- weak_displacement_body: 8
- fvg_retrace_too_deep: 8
- fvg_too_small: 6
- raid_too_extended: 4
- stop_too_wide: 1

This supports the original diagnosis: v1 finds the narrative shape too broadly, while many failed examples have weak displacement, tiny/deeply retraced FVGs, or overextended raids.

## Walk-Forward Preflight

Verdict: blocked.

Blockers:

- filtered_candidate_count_below_20
- target_first_count_below_20

The filtered result is directional but too narrow. A 1-of-1 retained sample is not evidence; it is a hypothesis.

## Strategy Library Status

`nasdaq_london_raid_ny_reversal_v2_filtered_research` is registered as an executable research detector with replay required. It remains research-only.

Opportunity scanner integration is deferred because the scanner does not safely carry the full candle-window telemetry needed to compute v2 filters. V2 should be run through explicit audit/replay paths until a compact scanner-safe telemetry path exists.

## Promotion Decision

No promotion.

V2 did improve the retained sample quality, but it produced only one retained candidate across the 90-day window. That is insufficient for walk-forward, Paper-Demo, or readiness progression.

## Recommendation

Keep v2 as a filtered research hypothesis. Next useful work:

1. Collect more independent v2-filtered candidates over additional history or symbols.
2. Test a softer sub-variant that preserves FVG size/retrace quality but relaxes stop distance slightly, because 2026-03-30 was target-first and failed only `stop_too_wide`.
3. Do not loosen v1. Treat v1 as recognition and v2 as quality telemetry.
4. Do not add Paper-Demo eligibility unless independent replay/OOS/evidence/maturity gates pass.
