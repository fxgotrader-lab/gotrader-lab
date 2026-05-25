# Readiness Gate Debugger

The Readiness Gate Debugger explains why Demo Candidate approval is blocked.

This is simulation-only readiness gating. Broker execution remains disabled.

## What The Debugger Shows

The `/readiness-gate` page now includes:

- Why Approval Is Blocked
- each gate requirement pass/fail status
- current value
- required value
- explanation
- suggested fix
- direct page link for missing or weak evidence
- Debug Readiness Inputs panel
- Research Override action for simulation notes only

The debugger does not weaken the Paper-Demo Candidate gate. It only makes the blockers transparent.

## Required Pages

If data is missing, run the required page:

- `/validation` for the latest validation suite
- `/research-quality` for the quality review
- `/simulation-runbook` for the AI Lab to go-trader simulation verification

The debugger will point to the exact page that must be completed.

## Common Blockers

Paper-Demo Candidate remains blocked when:

- validation has not been run
- research quality review has not been run
- research quality is not Paper-Demo Candidate
- simulation runbook is incomplete
- broker execution skipped is not checked
- positions or trades are not zero
- drawdown exceeds threshold
- confidence calibration is weak
- false positives are too high
- session consistency fails
- conservative scenario is not stable

## Research Override

Research Override lets a user mark the current evidence as Research Ready for simulation notes only.

It cannot:

- mark Paper-Demo Candidate
- approve demo execution
- connect a broker
- enable paper/demo trading
- place orders
- bypass failed Paper-Demo Candidate requirements

Use Research Override only to continue simulation research when the strategy is not ready for paper-demo approval.

## Safety Boundary

The debugger does not add broker code, Tradovate, TopStep, API keys, websocket feeds, live trading, or multi-account/copy-trading logic.

Manual approval remains local-only and informational until a separate future paper-demo implementation is explicitly designed and built.
