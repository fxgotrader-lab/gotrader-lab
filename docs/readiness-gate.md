# Readiness Gate And Manual Approval Layer

GoTrader AI Lab uses the Readiness Gate to block future paper-demo progression until research evidence and manual review both pass.

This is simulation-only readiness gating. Broker execution remains disabled.

## Inputs

The gate evaluates local browser records only:

- latest Strategy Validation report
- latest Research Quality review
- latest Simulation Verification Runbook state
- drawdown thresholds
- confidence calibration
- false-positive count
- session consistency
- conservative scenario stability

## Readiness States

`Not Ready`

The system is missing evidence or has failed core requirements.

`Research Ready`

The system has enough evidence for more simulation research, but it is still blocked from paper-demo progression.

`Paper-Demo Candidate`

Every required readiness check passed. This still does not enable broker execution. It only allows the user to record a local manual approval that the strategy may be considered for a separate future paper-demo implementation.

## Manual Approval Actions

The UI supports:

- Approve Demo Candidate
- Reject Demo Candidate
- Pause Readiness
- Reset Readiness

Approval is disabled unless the evidence state is `Paper-Demo Candidate`.

Every action records:

- timestamp
- reviewer name
- notes
- readiness state
- audit entry

## Required Paper-Demo Candidate Checks

- latest validation results exist
- latest research quality review exists
- Research Quality is Paper-Demo Candidate
- simulation runbook is complete
- broker execution skipped is checked
- positions = 0 is checked
- trades = 0 is checked
- shutdown complete is checked
- validation drawdown is within threshold
- no red drawdown clusters
- confidence calibration passes
- false positives are controlled
- session consistency passes
- conservative scenario stability passes

## Safety Boundary

This layer does not:

- connect to brokers
- place orders
- enable paper trading
- store broker API keys
- open websocket feeds
- integrate Tradovate or TopStep
- support multi-account or copy-trading

Manual approval is a research audit record only. Broker execution remains disabled until a separate future implementation is explicitly designed, reviewed, and built.
