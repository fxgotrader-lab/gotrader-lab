# Agent Decision Audit

GoTrader AI Lab uses the Agent Decision Audit workflow to explain how research agents reached their conclusions. This is an explainability layer only. It cannot execute trades, approve trades, connect to brokers, or override readiness gates.

## What Gets Audited

- ICT Liquidity Agent
- ICT Structure Agent
- Session Timing Agent
- Session Levels Agent
- Auction/Volume Profile Agent
- Macro Event Risk Agent
- Intermarket Confirmation Agent
- Positioning/Gamma Agent
- Risk/Reward Agent
- Volatility Regime Agent 2.0
- Order Flow Agent when the later data layer is available
- CIO Synthesis
- LLM advisory agents
- Auto Research candidate selector
- Self-Improvement proposal creator
- Readiness Gate decision

## How To Read Audit Scores

Each trace receives an audit score from 0 to 100.

- `reliable`: evidence is complete, safety checks are clear, and confidence matches the available facts.
- `needs_review`: decision is usable for research but has warnings or missing context.
- `weak_evidence`: important evidence is missing or confidence is not well supported.
- `inconsistent`: the decision conflicts with important ICT, validation, or readiness evidence.
- `unsafe_rejected`: the decision attempted execution authority, broker authority, readiness override, or unsafe language.

## What Weak Evidence Means

Weak evidence does not mean the idea is wrong. It means the system should not trust the decision without more simulation evidence. Common causes include:

- Missing validation or research-quality data.
- Zero-trade backtest results.
- High confidence with few supporting factors.
- Ignored ICT bias or missing confluence.
- A calibration proposal with no before/after simulation metrics.

## How Audit Findings Feed Calibration

Audit findings help identify which part of the research loop should be improved:

- Weak deterministic agent evidence can lead to prompt or rule calibration.
- Weak CIO synthesis can point to agent-weight or confidence calibration.
- Weak futures market-context evidence can identify missing session, auction, macro, intermarket, positioning, or order-flow data.
- Auto Research audit findings can show whether stability-first selection was respected.
- Self-Improvement audit findings can show whether a proposal changes too many variables at once.
- Readiness audit findings explain exactly why Paper-Demo Candidate remains blocked.

## Safety Boundary

Agents do not receive execution authority. Audit traces explicitly check:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`
- broker execution disabled
- approval required for calibration proposals

Audit output is for research, review, and calibration only.
