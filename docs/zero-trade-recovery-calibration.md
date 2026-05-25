# Zero-Trade Recovery Calibration

GoTrader AI Lab treats a zero-trade backtest as an evaluation blocker. If no simulated trades are generated, the system cannot score outcomes, drawdown, false positives, or confidence calibration with enough evidence.

## When A Proposal Is Created

Auto Research may create an approval-required calibration proposal when all of these are true:

- The original backtest produced `0` simulated trades.
- Trade-generation diagnostics identified `confluence_threshold_too_high`.
- A bounded recovery pass produced valid simulated trades.
- False positives stayed controlled.
- Session consistency passed.
- Conservative scenario stability passed.

The proposal targets `trade_generation_blocked` and lowers the confluence threshold slightly. It does not change broker settings, execution permissions, readiness rules, or API credentials.

## Why Recovery Is Evidence, Not Approval

Recovery trades show that the original configuration may have been too strict to evaluate. They do not prove the strategy is ready for paper/demo execution. The recovered configuration must still be reviewed, validated, and manually approved before it can become an active simulation calibration.

## Approval Requirement

The Self-Improvement page records the proposal with:

- `approvalRequired: true`
- trades before recovery
- trades after recovery
- quality gates that passed
- safety notes confirming simulation-only behavior

The user must approve or reject the proposal. Until approval, the active calibration is unchanged.

## Safety Boundary

This workflow is simulation/research only.

- Broker execution remains disabled.
- Readiness is not overridden.
- Paper/demo/live trading is not enabled.
- No orders are placed.
- Recovery cannot force a Paper-Demo Candidate result.
