# Auto Research Self-Improvement Supervisor

The Auto Research Supervisor is a simulation-only optimizer for GoTrader AI Lab. It searches bounded research configurations, runs mock-data backtests and validation suites, compares candidates against the current baseline, and creates approval-gated calibration proposals.

It cannot execute trades, enable paper/demo/live trading, change broker settings, override readiness gates, approve its own proposals, or modify secrets.

## How It Searches Configurations

The supervisor starts from the active Backtest Lab configuration and generates a small set of candidate settings. Search modes include:

- conservative search
- balanced search
- aggressive research-only search
- session-focused search
- stop-model-focused search
- long/short-bias search

The bounded search space may adjust:

- confluence threshold
- confidence threshold
- session filter
- stop model
- target R multiple
- long/short direction filters
- internal agent weights
- ICT scoring weights

The supervisor must never search over:

- broker settings
- execution permissions
- live mode
- demo mode activation
- contract size
- max daily loss
- API keys
- readiness gate bypass
- manual approval permissions

## Candidate Testing

Each candidate runs through existing simulation-only systems:

1. mock-candle backtest
2. validation suite
3. research quality review
4. baseline comparison
5. stability-first scoring

All candidate results are stored in the local audit trail.

## Why Stability Beats Profit

The supervisor does not select a candidate simply because it has the highest profit or best single result. It scores candidates using:

- lower max drawdown
- better average R
- acceptable win rate
- lower false positives
- confidence calibration
- session consistency
- sufficient trade count
- skipped-signal balance
- profit factor
- robustness across scenarios

Drawdown, calibration, false positives, trade count, and robustness have priority over isolated profit.

## Proposal Creation

If the best candidate improves stability enough, the supervisor creates a `CalibrationProposal` in the Self-Improvement workflow.

The proposal:

- remains simulation-only
- has `approvalRequired: true`
- includes before and after metrics
- includes a safety reason and notes
- cannot alter broker or execution permissions
- cannot override readiness gates

The active baseline is not changed when the proposal is created.

## Approval Requirement

Only the user may approve a proposal. Acceptance still happens through the Self-Improvement page after reviewing before/after metrics.

Auto Research cannot approve its own proposal.

## LLM Supervisor Roadmap

The current implementation uses deterministic candidate generation as a baseline optimizer. Full autonomous research mode requires an LLM supervisor layer that can recommend search directions through a secure provider boundary.

The LLM supervisor may later suggest:

- which search mode to run
- which weak condition to target
- which session or stop model to compare
- which calibration change should be tested next

Even then, LLM output remains advisory only. It cannot execute trades or override readiness gates.

## Safety Rules

1. Auto Research cannot execute trades.
2. Auto Research cannot enable paper, demo, or live trading.
3. Auto Research cannot change broker settings.
4. Auto Research cannot override readiness gates.
5. Auto Research cannot approve its own proposal.
6. Auto Research cannot modify API keys or secrets.
7. Auto Research must log every candidate and decision.
8. Active baseline changes require user approval.
