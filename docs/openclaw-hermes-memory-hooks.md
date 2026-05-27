# OpenClaw / Hermes Advisory Memory Hooks

GoTrader AI Lab now defines planning-only hook contracts for future OpenClaw memory review and Hermes notifications. These contracts are for research explainability and routing only. They do not connect to a live OpenClaw or Hermes service yet.

## Purpose

The autonomous research loop produces useful events: blocker diagnosis, scenario selection, candidate testing, walk-forward results, proposal review, calibration drift, maturity changes, and readiness changes. The hook contracts make those events portable later without changing the AI Lab source-of-truth model.

OpenClaw is intended for advisory memory and review. Hermes is intended for notification routing back into the app.

## OpenClaw Memory Packets

OpenClaw packets are defined in `src/lib/integrations/advisoryMemoryTypes.ts` and created by `src/lib/integrations/openclawMemoryHooks.ts`.

Supported packet types:

- `failure_analysis_memory`
- `scenario_recommendation`
- `proposal_review`
- `calibration_drift_note`
- `post_cycle_summary`

Each packet includes:

- event and cycle identifiers
- runtime fingerprint
- data source
- evidence quality score
- maturity score
- readiness state
- blockers
- selected scenario family
- candidate summary
- walk-forward summary
- proposal summary
- safety locks
- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

OpenClaw responses must use `mode: advisory_memory_only`. A response can suggest a next scenario, describe risk, or record missing evidence, but it cannot approve a proposal, change readiness, execute trades, or control broker settings.

## Hermes Notifications

Hermes payloads are defined in `src/lib/integrations/hermesNotificationHooks.ts`.

Supported notification events:

- `autonomous_loop_started`
- `cycle_completed`
- `calibration_auto_applied`
- `auto_apply_blocked`
- `walk_forward_failed`
- `walk_forward_insufficient`
- `maturity_improved`
- `readiness_changed`
- `action_required`

Each notification includes a title, summary, severity, route back into GoTrader AI Lab, timestamp, and authority set to `none`.

## Source Of Truth

GoTrader AI Lab remains the source of truth for:

- proposal approval and rejection
- readiness state
- research maturity
- active calibration
- audit trail
- communications history

External tools may later mirror events or suggest review notes, but approvals stay inside the app.

## Safety Rules

- No broker execution.
- No live trading.
- No Tradovate implementation.
- No API keys in frontend packets.
- No websocket feeds.
- No readiness override.
- No order execution.
- No go-trader handoff authority.

## Future Bridge Option

A future local or VPS bridge may watch for advisory memory packets and post back OpenClaw responses or Hermes notification receipts. That bridge must preserve the authority contract and route the user back to GoTrader AI Lab for any human decision.
