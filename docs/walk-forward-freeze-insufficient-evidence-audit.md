# Walk-Forward Freeze and Insufficient Evidence Audit

## Scope

This audit covers the walk-forward path after Replay. It is limited to research-only validation plumbing, UI responsiveness, source-depth handling, and evidence messaging. No execution, broker mutation, MT5 mutation, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion was added.

## Root Cause

Walk-Forward previously started rolling-window validation directly from the page action. The page could show a busy state, but it did not run a compact evidence preflight first, so low-evidence cases still entered the heavier walk-forward path before eventually producing a vague `insufficient_evidence` verdict.

The result message came from the generic stability analyzer:

`Walk-forward validation has insufficient evidence; increase windows or out-of-sample trade count before judging strategy quality.`

That sentence did not explain whether the blocker was missing replay handoff, missing strategy/model id, missing source fingerprint, shallow tactical MT5 data, too few replay candidates, too few unique dates, or too few OOS windows/trades.

## Source Depth Finding

GoTrader now separates:

- `tactical_latest_window`: active chart/research preview, usually the latest MT5 candles.
- `mt5_90_day_range`: explicit MT5 range-history request used for validation runs.
- `active_walk_forward_source`: already prepared imported or canonical walk-forward source.

Dashboard and Advisor page load still avoid automatically fetching 90 days. Walk-Forward can request explicit 90-day MT5 range history only after the operator starts the run.

## Replay-To-Walk-Forward Handoff

Walk-Forward now reads the latest compact validation-chain entry and uses it as preflight input:

- strategy/model id
- validation chain id
- requested symbol
- broker symbol
- timeframe
- source fingerprint
- compact replay verdict
- replay signal count

Raw replay rows and candle arrays are not passed to the UI or persisted in walk-forward results.

## Preflight Gate

The new preflight checks:

- source eligibility
- strategy/model id
- source fingerprint
- replay result presence
- replay verdict
- replay candidate count
- replay-passed candidate count
- source depth
- unique trading dates
- rolling windows available
- estimated OOS trades

If a hard requirement is missing, Walk-Forward does not start the heavy rolling backtests. It returns a compact `completed_with_warnings` run with structured blockers and the next action.

## Responsiveness Fixes

- Duplicate run clicks are ignored.
- The button becomes disabled while a run is active.
- The page displays preflight status before work starts.
- The orchestrator emits a preflight progress event before window processing.
- Preflight-blocked runs return early.
- Explicit MT5 90-day history is requested only after an operator starts Walk-Forward.

## Insufficient Evidence Message

The stability analyzer now includes exact insufficient-evidence reasons in its summary. Preflight-blocked runs also surface the first blocker and attach all blocker messages to the evidence summary and diagnostics.

Example:

`Walk-forward did not run because Replay has only 3 candidate(s); 20 are required before walk-forward can judge strategy quality.`

## Remaining Limitations

The compact replay handoff currently includes replay verdict and signal count, not full per-candidate date distribution. Preflight estimates unique dates from the selected source candles. Exact candidate-date concentration remains a replay/diagnostic responsibility and should stay compact if added later.

## Safety

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

Walk-Forward remains simulation/research-only and cannot create orders, mutate broker state, call MT5 execution, approve readiness, or promote Paper-Demo by itself.
