# Autonomous Research Supervisor Loop

The autonomous research supervisor is a local simulation-only loop. It can diagnose research failures, choose a scenario family, run bounded research tests, validate a candidate with walk-forward, and apply only a safe research calibration when the autonomy safety policy allows it.

It cannot execute trades, approve Paper-Demo Candidate, send a go-trader handoff, enable broker/demo/live mode, change API keys, or override readiness.

## Default Loop Settings

- Max iterations: `3`
- Stop after no improvement: `2` iterations
- Imported data: safe mode by default
- Auto-apply: disabled by default
- Storage: compact local summaries only
- Cancellation: supported from the UI

## Loop Order

1. Resolve the canonical `ResearchRuntimeSnapshot`.
2. Diagnose current blockers.
3. Select a scenario family and log why it was selected.
4. Run the AI Research Cycle using the selected scenario family.
5. If a proposal is created, run walk-forward validation.
6. Evaluate auto-apply eligibility using the autonomy safety policy.
7. If policy mode is enabled and every guard passes, apply only the safe research calibration fields.
8. Store calibration drift history.
9. Rerun with the updated baseline only if more iterations are allowed.
10. Stop on safety, maturity, walk-forward, evidence, no-improvement, or review boundaries.

## Blockers Diagnosed

- low win rate
- low average R
- high drawdown
- false positives
- session inconsistency
- confidence calibration weakness
- insufficient trades
- evidence quality weakness
- walk-forward insufficient evidence
- walk-forward failure
- maturity too low
- regime mismatch

## Scenario Families

- `session_focus`
- `stop_model_focus`
- `target_model_focus`
- `confidence_calibration_focus`
- `evidence_quality_focus`
- `long_short_focus`
- `conservative_only`
- `walk_forward_followup`

Every scenario selection stores the blocker that caused selection, evidence used, rejected scenario families, and a one-line reasoning summary.

## Auto-Apply Eligibility

Auto-apply is allowed only when policy mode is explicitly enabled and all of these are true:

- proposal is `research_calibration_candidate`
- material improvement exists
- no no-op or snapshot mismatch warning exists
- no critical regression exists
- sample size minimum is met
- evidence quality minimum is met
- walk-forward did not fail or return insufficient evidence
- maturity drop is within the configured floor
- no regime mismatch is detected
- LLM advisory passed if the provider is configured
- change is bounded
- no cooldown or oscillating identical patch violation exists

Allowed research-only fields:

- confluence threshold
- confidence threshold
- session filter
- stop model
- target R multiple
- long/short filter
- ICT scoring weights
- agent weights
- confidence penalty rules
- evidence quality penalty rules

Never auto-applied:

- broker settings
- API keys
- Tradovate settings
- live/demo mode
- order execution
- contract size
- max daily loss
- readiness override
- go-trader handoff approval
- paper-demo approval
- safety-lock changes

## Stop Conditions

The loop stops when:

- max iterations are reached
- no improvement limit is reached
- Research Ready is stable enough for review
- Paper-Demo Candidate review is reached
- evidence quality is too low
- walk-forward repeatedly fails
- regime mismatch is detected
- the user cancels

## Go-Trader Handoff Gate

The loop may mark `ready for go-trader review` only when readiness is Paper-Demo Candidate, maturity and evidence quality are acceptable, walk-forward passes, and the simulation runbook is complete. This is still review-only. Broker execution remains disabled.

## OpenClaw and Hermes Hooks

The supervisor exposes planning-only interfaces for:

- OpenClaw failure analysis memory
- OpenClaw scenario recommendations
- OpenClaw proposal review
- Hermes notification events

These hooks do not require a live connection and have no execution authority.
