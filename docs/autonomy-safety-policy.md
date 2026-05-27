# Autonomous Research Safety Policy

GoTrader AI Lab treats autonomous research as a simulation-only optimizer. It may diagnose weak configurations, suggest bounded follow-up searches, and create approval-required calibration proposals. It must not apply calibrations automatically when the evidence suggests regime mismatch, insufficient walk-forward coverage, weak maturity history, or unclear scenario-selection reasoning.

## Hard Authority Limits

- No trade execution.
- No broker, demo, or live trading control.
- No readiness override.
- No automatic Paper-Demo Candidate approval.
- No go-trader handoff submission.
- No API key or secret changes.

## Regime Mismatch Pause

The loop now recognizes these blocker categories:

- `regime_mismatch`
- `regime_shift_detected`
- `regime_evidence_insufficient`

Regime mismatch is flagged when performance degrades across walk-forward windows that likely represent different volatility, trend, chop, or session conditions. The practical pattern is: one window works, another out-of-sample window fails, and win rate, average R, and drawdown deteriorate together. When that happens, the loop pauses auto-apply and recommends regime-specific testing instead of generic calibration search.

## Maturity Degradation Floor

The default autonomy policy uses:

- `maxMaturityDropPerAutoApply = 5`
- minimum calibration survival count = `2`
- basic trend history = `3` cycles
- reliable trend history = `5` cycles

Auto-apply is blocked if a proposed calibration would drop maturity by more than 5 points, downgrade the maturity grade, reset calibration survival below the minimum without a clear reason, or materially degrade evidence quality or walk-forward status.

## Insufficient Evidence Policy

Walk-forward `insufficient_evidence` blocks auto-apply by default. A future exception may be added, but it is disabled now. Even a future exception must be numerically minor:

- confluence threshold delta <= `0.03`
- confidence threshold delta <= `0.03`
- target R multiple delta <= `0.25`
- agent weight delta <= `0.05`
- no session lockout changes
- no direction lockout changes
- no stop model changes

Even minor changes would still require no critical regression, sufficient evidence quality, no maturity degradation, and enough simulated sample size.

## Trend History

Maturity/readiness trend is not meaningful until enough cycles exist.

- Fewer than 3 cycles: `Building history - trend unavailable until at least 3 cycles.`
- 3 to 4 cycles: basic trend only.
- 5 or more cycles: reliable trend available.

This prevents the dashboard from implying a reliable trend after a single good or bad run.

## Scenario Selection Reasoning

Whenever Auto Research selects a scenario family, it records:

- selected scenario family
- blocker categories that caused the selection
- consecutive count
- evidence used
- rejected scenario families and why
- one-line reasoning summary

Example:

`Selected session focus because session consistency is weak in the latest evidence.`

The latest reasoning is visible on Dashboard and Auto Research, and scenario-selection history is stored locally in the autonomy safety state and Auto Research audit trail.

## Why Auto-Apply Remains Blocked

The current default policy sets `autoApplyEnabled` to `false`. Research calibrations remain proposal-only until the user approves them. This is intentional: autonomous research can improve the research process, but it cannot grant itself execution authority or readiness approval.
