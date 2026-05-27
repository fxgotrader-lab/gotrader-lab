# Mission-Control Dashboard

The Dashboard is now the primary command center for supervising GoTrader AI Lab. It is intentionally less like a feature catalog and more like a mission-control surface: start or stop the autonomous research loop, watch where the system is in the pipeline, and respond only when a gate or review item needs attention.

## Purpose

The Command Center answers three questions:

- Is the research system healthy and running?
- Where is the system in the research pipeline?
- Does anything require human attention?

Detailed tables, diagnostics, and tuning controls remain available on drill-down pages or inside Advanced details.

## Pipeline Stages

1. Lab / Market Data: confirms whether mock or imported historical data is active.
2. AI Research: runs thesis refresh, backtest, LLM advisory, Auto Research, validation, research quality, and readiness updates.
3. Agent Debate / CIO: shows whether the debate layer produced a CIO consensus or no-consensus state.
4. Backtest / Validation: confirms simulated trades and validation evidence.
5. Walk-Forward: checks whether candidate behavior survives multiple imported-data windows.
6. Self-Improvement: surfaces calibration proposals, manual review, or policy-gated auto-apply decisions.
7. Go-Trader Review Gate: locked review-only state. It does not send execution handoffs.
8. Tradovate Future Gate: locked future placeholder. No broker connection exists.

## Status Meanings

- Active: the supervisor is currently working in that stage.
- Waiting: no current evidence or run has reached the stage yet.
- Complete: the stage has current evidence.
- Warning: the stage has evidence but needs review or more data.
- Blocked: human action or a failed gate prevents advancement.
- Locked: the stage is intentionally unavailable for execution authority.

## Action Required

The Action Required panel shows only meaningful items such as:

- proposal review required
- failed or insufficient walk-forward validation
- weak evidence quality
- maturity too low
- readiness gate blockers
- missing LLM advisory review
- unavailable imported market data
- regime mismatch pause

If the panel is clear, the user can keep supervising without visiting detail pages.

## What Is Automated

The Command Center can start the autonomous research supervisor loop. The loop may diagnose blockers, select scenario families, run bounded Auto Research, run validation and walk-forward, update maturity, and create or block research calibration proposals.

Policy-gated auto-apply is off by default. When enabled, it can only apply safe research-only calibration fields if the autonomy safety policy allows it.

## What Remains Locked

The Command Center cannot:

- execute trades
- approve Paper-Demo Candidate automatically
- send go-trader execution handoffs
- connect Tradovate
- override readiness
- change broker, API, risk, contract-size, demo/live, or order settings

Broker execution remains disabled on the dashboard at all times.

## Drill-Down Workflow

Use the dashboard for supervision. Click a pipeline stage or Advanced detail link when the system asks for action:

- Market Data for imported candle state and presets
- Agent Debate for consensus reasoning
- Walk-Forward for OOS window results
- Self-Improvement for proposals
- Readiness Gate for blockers
- Autonomous Research for loop history
- Performance for canonical metrics
- Simulation Runbook for review-only go-trader gate checks
