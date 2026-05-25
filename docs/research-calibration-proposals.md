# Research Calibration Proposals

GoTrader AI Lab separates research calibration from paper-demo readiness. A candidate can improve the research baseline and still be blocked from Paper-Demo Candidate. In that case, Auto Research should create an approval-required Research Calibration Candidate rather than pretending the system is ready.

## Proposal Categories

`research_calibration_candidate`

- Used when a candidate improves trade generation or stability but is not paper-demo ready.
- May adjust simulation assumptions such as confluence threshold, session filter, stop model, or target multiple.
- Requires user approval before active simulation settings change.
- Must be retested after approval.
- Does not enable demo/live trading.
- Does not override readiness.

`paper_demo_candidate_review`

- Used only when simulated evidence reaches the stricter candidate-review level.
- Still does not place trades or enable paper/demo execution.
- Still requires manual approval and readiness review.

## Why Improved-But-Not-Ready Matters

Adaptive Auto Research can find configurations that generate more valid simulated trades, reduce drawdown, improve average R, or control false positives without fully clearing readiness. These candidates are useful because they can become the next research baseline. The next cycle can then test from a stronger starting point.

## Zero-Trade Recovery

If the original backtest creates zero trades and diagnostics show that confluence was too strict, a bounded recovery pass may slightly lower confluence and produce valid simulated trades. That is evidence for a research calibration proposal, not automatic readiness.

The proposal records:

- trades before and after recovery
- score before and after
- drawdown, average R, false-positive, and readiness changes when available
- why the candidate is not paper-demo ready
- what validation must be rerun after approval

## Approval And Retesting

Approving a Research Calibration Candidate updates the local simulation baseline only after the proposal has been tested and accepted in the Self-Improvement page. After approval, rerun:

1. AI Research Cycle
2. Validation Suite
3. Research Quality Review
4. Readiness Gate

## Safety Boundary

Research calibration proposals are simulation-only.

- Broker execution remains disabled.
- Demo/live trading remains disabled.
- Readiness is not overridden.
- API keys and broker settings are not modified.
- No orders are placed.
