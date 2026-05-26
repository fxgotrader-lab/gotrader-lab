# GoTrader AI Lab Dashboard Command Center

The `/dashboard` page is the main monitoring and approval center for GoTrader AI Lab. It summarizes the full research loop in one place: LLM advisory review, structured agent debate, auto-research configuration search, validation, research quality review, self-improvement proposals, readiness gating, simulation bridge checks, and safety locks.

## Purpose

The command center is designed to make the system feel like an automated research cockpit while keeping execution disabled. It shows what the AI research process has done, what still needs review, and what the user must approve before settings change.

The dashboard does not place trades, connect to brokers, store API keys in browser code, or override readiness gates.

## Status Areas

### System Mode

Shows the fixed safety posture:

- Research Mode
- Simulation Mode
- Broker Execution: Disabled
- Live Trading: Disabled

### LLM Agent Status

Shows whether the required LLM advisory layer has produced a valid advisory-only review. Real research mode requires LLM advisory review before Paper-Demo Candidate can be reached. LLM agents cannot execute trades, approve trades, or override readiness gates.

### Agent Debate Consensus

Shows the latest structured debate moderation result. Agents publish opening statements, challenge or support each other, may update confidence, and the moderator declares consensus or flat/no consensus. Deterministic facts remain immutable and minority views stay visible.

### Auto Research Status

Shows the latest autonomous configuration search cycle. Auto Research can compare simulation-only candidate configurations and create calibration proposals, but it cannot apply them without user approval.

### Validation Status

Shows the latest validation suite results, including strongest scenario, weakest scenario, win rate, average R, and max drawdown.

### Simulated Account

Shows a simulation-only account model built from the latest dashboard AI Research Cycle backtest:

- simulated balance
- simulated P&L
- P&L %
- total trades
- win rate
- average R
- max drawdown
- profit factor
- best and worst trade

The default starting balance is `$50,000`. For now, GoTrader AI Lab assumes `1R = 1%` of starting balance so users can see a dollar-denominated simulation curve. This is not broker account money and is not connected to Tradovate.

If imported MNQ historical data powered the latest cycle, the card states that results are based on imported historical MNQ data. If mock data powered the cycle, the card states that results are based on mock data.

### Research Quality Status

Shows readiness grade, top weakness, top strength, and recommended next step from the research quality review.

### Self-Improvement Status

Shows the latest calibration proposal, proposal status, before/after metrics, and whether approval is required. Active settings only change after explicit approval.

### Readiness Gate

Shows the current readiness state:

- Not Ready
- Research Ready
- Paper-Demo Candidate

Paper-Demo Candidate remains blocked unless all required simulation, validation, research quality, runbook, and LLM advisory checks pass.

### Simulation Bridge Status

Shows handoff export status and simulation runbook verification. The bridge must keep broker execution skipped and trades at zero.

### Safety Locks

Always-visible locks show:

- Broker execution disabled
- Live trading disabled
- Readiness override disabled
- LLM execution authority none
- API keys not stored in browser

## Automation Timeline

The timeline shows the latest events across the research loop:

1. LLM advisory run
2. Auto research cycle
3. Validation run
4. Research quality review
5. Self-improvement proposal
6. Readiness gate update
7. Simulation bridge verification

Missing or blocked items are shown as needing attention.

## Recommended Next Action

The dashboard chooses the next action based on current state. Typical actions include:

- Configure or start the local LLM bridge
- Run GPT Advisory Review
- Run Auto Research Cycle
- Review a self-improvement proposal
- Run validation
- Run research quality review
- Review readiness gate blockers
- Verify the simulation bridge

If all research checks pass, the dashboard still reminds the user not to proceed to broker demo from this frontend. Broker-demo execution requires a separate future implementation.

## Run AI Research Cycle

The dashboard includes a single safe control: **Run AI Research Cycle**. It runs the research workflow in order:

1. Generate or refresh the research thesis with ICT context and CIO synthesis.
2. Run a structured agent debate and store moderator consensus.
3. Run a mock-data backtest with the active Backtest Lab config.
4. Try the local LLM advisory bridge.
5. Continue with deterministic simulation steps if the bridge is unavailable.
6. Run multi-pass Auto Research configuration search.
7. Run the validation suite.
8. Run research quality review.
9. Check for an approval-required self-improvement proposal.
10. Update the simulation runbook with the research pipeline timestamp without marking scheduler verification checks.
11. Recompute readiness without applying overrides.
12. Log the result into the in-app communications audit trail.

If the local LLM bridge is not running, the cycle records a warning and continues only through safe simulation steps. It does not mark LLM advisory as passed. Any calibration proposal created by Auto Research remains approval-required and does not change active settings automatically.

If the backtest fails, the cycle stops candidate scoring and marks downstream optimization as skipped, because Auto Research and validation require a valid mock-data replay foundation.

The dashboard control supports quick, standard, and deep Auto Research passes. Quick tests 5 candidates, standard tests 10, and deep tests up to 25. During the Auto Research step, the UI reports candidate progress and the best stable candidate so far. If no candidate reaches Paper-Demo Candidate criteria, the final state says no safe Paper-Demo Candidate was found and recommends continued research.

Final cycle status is one of:

- `completed`
- `completed_with_warnings`
- `failed`

Warnings include missing LLM advisory review, readiness blockers, skipped non-critical steps, or an approval-required proposal. A `completed_with_warnings` cycle still cannot unlock broker execution.

See [research-cycle-pipeline.md](research-cycle-pipeline.md) for the full pipeline contract.

## Daily Monitoring Workflow

1. Start the local LLM bridge.
2. Run GPT Advisory Review.
3. Run Auto Research Cycle.
4. Review any calibration proposal.
5. Run Validation Suite.
6. Run Research Quality Review.
7. Check Readiness Gate.
8. Verify Simulation Bridge.

This loop is meant to improve research quality before any future paper-demo architecture is implemented.

## What Still Requires Approval

The system can generate candidate calibrations and advisory recommendations, but the user must approve calibration changes. The readiness gate cannot be bypassed by LLM agents, Auto Research, advisory responses, or self-improvement proposals.

## Execution Boundary

GoTrader AI Lab remains a research and simulation cockpit. The dashboard research cycle never places orders, connects to brokers, enables paper/demo/live mode, changes API keys, or overrides readiness. Any future paper-demo execution layer must live behind explicit risk controls, manual approval, and a separate broker-demo bridge implementation. No broker execution exists in this dashboard.
