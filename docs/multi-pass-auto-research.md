# Multi-Pass Auto Research Search

GoTrader AI Lab can run bounded multi-pass configuration searches from `/auto-research` and from the dashboard AI Research Cycle. This is simulation research only.

Auto Research can optimize simulation settings only. It cannot execute trades, enable demo/live mode, or override readiness.

## Search Modes

- `quick`: tests 5 candidates.
- `standard`: tests 10 candidates.
- `deep`: tests up to 25 candidates.
- `session_focus`: compares session filters such as London, New York, and kill zones.
- `stop_model_focus`: compares latest swing, fixed tick, and FVG invalidation assumptions.
- `long_short_focus`: compares long-only, short-only, and agent-weight nudges.
- `conservative_only`: tests stricter evidence gates.

Each candidate is bounded to research settings: confluence threshold, confidence threshold, session filter, stop model, target R multiple, long/short allowance, agent weights, and ICT scoring weights.

## What Candidates Cannot Change

Candidates cannot change broker settings, execution permissions, live/demo mode, contract size, max daily loss, readiness gate rules, API keys, or manual approval permissions.

## Evaluation

Each candidate runs:

1. Mock-data backtest.
2. Validation suite.
3. Research quality review.
4. Readiness estimate.

The score prioritizes stability before profit:

- lower max drawdown
- fewer false positives
- stable average R
- acceptable win rate
- confidence calibration
- session consistency
- sufficient trade count
- skipped signal balance
- profit factor, only as a supporting factor

## Result Categories

- `rejected`: failed one or more safety/stability checks.
- `improved_but_not_ready`: improved stability but does not support readiness.
- `research_ready`: better research candidate, still simulation-only.
- `paper_demo_candidate`: candidate passed the strict readiness estimate, but still requires manual approval.
- `unsafe_overfit`: attractive score pattern with too little sample, too much drawdown, or fragile skipped-signal behavior.

## No Forced Success

The system does not search until it finds a success. If no candidate meets Paper-Demo Candidate criteria, the UI reports:

`No safe Paper-Demo Candidate found. Continue research.`

It then shows the top 3 closest candidates and why they failed. This protects the research process from overfitting and wishful selection.

## Proposals And Approval

If a candidate improves stability, Auto Research may create a self-improvement proposal. The proposal remains `proposed` and approval-required. It does not apply settings automatically, enable paper/demo/live mode, or override readiness gates.

Broker execution remains disabled throughout the entire workflow.
