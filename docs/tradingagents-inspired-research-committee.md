# TradingAgents-Inspired Research Committee

Last updated: 2026-06-04

This note documents a GoTrader-native reporting layer inspired by the public
TauricResearch/TradingAgents project. TradingAgents is used only as a design
reference. GoTrader does not import TradingAgents, LangGraph, Python runtime
code, or external trading-agent execution components.

## Borrowed Concepts

The useful patterns for GoTrader are:

- Analyst/researcher/risk committee workflow.
- Bull and bear research debate.
- Risk-management review before any stronger claim.
- Portfolio-manager-style final synthesis, renamed here to Research Chair.
- Decision log for reproducibility.
- Reflection memory for what worked, what failed, and what to test next.
- Checkpoint/resume planning for long future research loops.
- Provider configurability and reproducibility warnings for advisory text.

## GoTrader-Native Mapping

| TradingAgents-inspired concept | GoTrader-native equivalent |
| --- | --- |
| Analyst/researcher workflow | Deterministic source, regime, ICT, Grinch, metrics, evidence, maturity, and readiness summaries |
| Bull/bear debate | Research Committee Bull Case and Bear Case sections |
| Risk management review | Conservative, balanced, and aggressive research-only risk views |
| Portfolio manager final decision | Final Research Chair Synthesis |
| Decision memory | Research Decision Log entry |
| Reflection memory | Deterministic Reflection Memory summary |
| Checkpoint/resume | Planned future research-loop checkpoint documentation only |
| Provider configurability | Advisory-only LLM/OpenClaw configuration remains separate from deterministic research |

## Research Decision Log

The Research Decision Log is created in
`src/lib/researchDecisionLog/buildResearchDecisionLogEntry.ts`.

Each entry records compact, deterministic fields:

- decision ID and timestamp
- source provider, requested symbol, broker symbol, source fingerprint
- candle count and timestamp range
- regime label, confidence, data quality, and missing inputs
- ICT thesis summary when present
- Grinch selected profile, blocker, timing grade, and optional expansion replay result
- simulated trades, win rate, average R, drawdown, profit factor, and false-positive rate
- walk-forward verdict when present
- evidence score and maturity score
- readiness state, blockers, warnings, and final research verdict
- authority set to none

Excluded by contract:

- candle arrays
- raw runtime snapshots
- secrets
- account/order/position data
- raw logs
- screenshots/base64

## Reflection Memory

Reflection Memory is deterministic and requires no LLM. It summarizes:

- what worked
- what failed
- repeated blocker
- what to test next
- whether the current calibration proposal is supported, unsupported, or needs more evidence
- whether the summary can later become a gbrain memory packet

It does not send anything to gbrain yet.

## Research Committee Report

The Research Committee report is created in
`src/lib/researchCommittee/buildResearchCommitteeReport.ts`.

Sections:

- Bull Case
- Bear Case
- Risk Committee
  - conservative view
  - balanced view
  - aggressive view
  - final risk chair verdict
- Final Research Chair Synthesis

Allowed research verdicts:

- observe
- reject_current_setup
- run_walk_forward
- run_calibration_test
- collect_more_data
- draft_self_improvement_proposal

The report uses "research verdict" language. It must not use trade-decision,
buy, sell, order, or live-trading language.

## UI Surfaces

Dashboard Advanced Details shows:

- compact Research Committee summary
- Latest Decision Log entry
- Reflection Memory summary

Agent Debate shows:

- full Bull Case
- full Bear Case
- Risk Committee
- Final Research Chair synthesis

Self-Improvement shows:

- deterministic Reflection Memory proposal support
- repeated blocker
- next test
- latest decision log ID

## gbrain and OpenClaw Compatibility

Decision Log and Reflection Memory are intentionally compact. They can be
converted to gbrain memory packets later because they exclude candles, raw
runtime snapshots, account/order/position data, secrets, and screenshots.

OpenClaw can later use these summaries as advisory/calibration context, but
OpenClaw is not called by this feature.

## Future Checkpoint/Resume Planning

Long research and autonomous loops can be interrupted or paused. A future
checkpoint/resume layer should persist compact decision-log checkpoints, source
fingerprints, active candidate family, validation stage, and last safe completed
step. This task does not implement runtime checkpoint/resume behavior.

## Safety

This feature is reporting only.

- No broker execution.
- No live trading.
- No order placement.
- No account/order/position mutation.
- No readiness override.
- Authority remains:
  - executionAuthority: none
  - brokerAuthority: none
  - readinessOverrideAuthority: none
