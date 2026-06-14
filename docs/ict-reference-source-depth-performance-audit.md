# ICT Reference, Source Depth, Performance, and OpenClaw Status Audit

## Scope

This audit covers reliability fixes for ICT chart-reference accuracy, MT5 source-depth reporting, multi-timeframe context propagation, Activate Market responsiveness, and OpenClaw bridge status labeling.

It does not add execution, broker mutation, order placement, MT5 mutation, account/order/position access, readiness override, OpenClaw auto-apply, or calibration apply authority.

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

## ICT Reference Accuracy

GoTrader now has a compact ICT reference resolver for:

- 12AM Open using session-local New York midnight, not literal UTC `HH:mm`
- Sunday Open using the first Sunday evening local session candle
- Previous day high/low by New York local trading date
- Latest swing high/low by compact fractal structure
- Consolidation high/low from rolling compression ranges
- Dealing range equilibrium, premium, discount, and equilibrium location
- Fair value gap references with source timeframe and timestamp

The resolver returns compact reference levels only. It excludes raw candles, snapshots, secrets, account data, order data, and position data.

## Source Depth Consistency

The shared `SourceStatusSnapshot` now distinguishes:

- Chart/tactical window, for example `1,000 x 5m`
- Explicit analysis depth, for example `88.95d` and `17,799` compact analysis candles when Activate Market has run
- Range-history availability
- Analysis timeframes loaded and missing
- Depth mode:
  - `validation_context`
  - `swing_context`
  - `tactical_only`
  - `unavailable`

The Dashboard and Advisor source banners now show that the selected chart timeframe is display/reference only, while top-down analysis uses explicit M5/M15/H1/H4/D1/W1 context when available.

## Multi-Timeframe Context

Current opportunity scans now carry a compact top-down context summary:

- W1: weekly bias
- D1: daily bias
- H4: HTF bias
- H1: dealing range
- M15: session model
- M5: confirmation/refinement
- M1: entry refinement, when available

The scan classifies top-down bias as:

- `aligned`
- `mixed`
- `conflicted`
- `insufficient_data`
- `unavailable`

This classification is explanatory. It does not loosen strategy thresholds or promote candidates.

## UI Responsiveness

Dashboard and Advisor Activate Market actions now yield one browser paint after setting the running state and before starting the guarded MT5/analysis path. This keeps the UI from appearing frozen while maintaining the same source-routing and strategy logic.

Heavy replay, walk-forward, Monte Carlo, and scorecard work remains manual/deferred.

## OpenClaw Bridge Status

OpenClaw bridge status remains advisory-only and explicitly distinguishes:

- `openclaw_not_configured`
- `openclaw_bridge_stub`
- `openclaw_skill_routed`
- `openclaw_timeout`
- `openclaw_bridge_offline`
- `unsafe_response_rejected`

Bridge stub responses are not treated as ordinary success. Skill-routed responses remain advisory/proposal-only with auto-apply disabled.

## Tests Added

- `test:ict-reference-accuracy`
- `test:source-depth-consistency`
- `test:top-down-timeframe-context`
- `test:openclaw-bridge-status`

These tests verify compact outputs, source-depth separation, top-down role labeling, local-session ICT references, OpenClaw status classification, and no raw candle/secret/account/order/position leakage.

## Remaining Notes

If the UI still shows tactical-only after MT5 90-day depth has been fetched, rerun Activate Market so the latest compact summary matches the active requested symbol, broker symbol, and primary timeframe.

This audit intentionally leaves all strategy thresholds, paper-demo gates, execution authority, broker authority, and readiness gates unchanged.
