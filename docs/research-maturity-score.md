# Research Maturity Score

GoTrader AI Lab uses the Research Maturity Score to estimate how much confidence the user should place in the current active calibration and strategy state. It is a research confidence layer only. It cannot approve execution, enable demo/live mode, connect to a broker, or override readiness gates.

## Purpose

Readiness can describe whether the latest evidence passes the current gate. Maturity answers a different question: has this calibration survived enough repeated research cycles, data windows, evidence checks, LLM reviews, and proposal history to deserve more trust?

A single strong backtest is not enough. A calibration must survive repeated tests without depending on mock data, missing market context, unstable performance, or one-off proposal artifacts.

## Inputs

The maturity resolver reads the canonical `ResearchRuntimeSnapshot` and scores:

- Active calibration survival count
- Research cycles run with the current calibration
- Data windows tested
- Safe, Standard, and Advanced window coverage
- Total simulated trades across tested windows
- Win-rate consistency
- Average-R consistency
- Drawdown consistency
- False-positive consistency
- Session consistency
- LLM advisory pass count
- Evidence quality score
- Readiness trend
- Accepted, rejected, no-op, and failed proposal history
- Whether results are mock-only or based on imported historical data

## Grades

- `untested`: no usable research cycle history.
- `early_research`: early evidence exists, but maturity is capped by missing coverage, mock data, low evidence quality, low trade count, missing LLM review, or a new calibration.
- `research_ready`: enough evidence for continued simulation research, but not enough repeatability for paper-demo review.
- `robust_research`: stronger repeated evidence across imported data and multiple cycles, but still advisory/research only.
- `paper_demo_candidate_review`: maturity is high enough to support a paper-demo review discussion. It still cannot approve trades or enable execution.

## Hard Caps

The score uses caps so a good-looking run cannot skip essential evidence:

- Mock-only research is capped at early research.
- Low evidence quality caps maturity.
- Too few simulated trades caps maturity.
- Missing LLM advisory review caps maturity.
- A new or newly accepted calibration is reduced until it survives fresh cycles.
- Large drift across windows prevents higher grades.
- Paper-demo review requires multiple successful imported-data cycles.

## Runtime Snapshot Integration

`resolveResearchRuntimeSnapshot()` now includes:

- `maturity.maturitySummary`
- `maturity.maturityWarnings`
- `maturity.maturityGrade`
- `maturity.maturityScore`
- `maturity.nextMaturityRequirement`

Dashboard, Readiness Gate, Self-Improvement, and `/research-maturity` read from this canonical snapshot so the maturity score stays aligned with active data, active calibration, proposal state, LLM status, evidence quality, and latest cycle metrics.

## UI Behavior

Dashboard shows a Research Maturity card with the grade, score, tested cycles, tested windows, evidence score, and next requirement.

Readiness Gate shows a maturity warning when maturity is insufficient for Paper-Demo Candidate.

Self-Improvement shows how a newly approved calibration affects maturity. A new calibration must survive additional cycles before maturity improves.

The `/research-maturity` page shows the full breakdown, missing requirements, proposal discipline, cycle/window history, and provenance details.

## Safety

Research maturity can block advancement. It cannot approve execution. It cannot enable paper/demo/live trading. It cannot change broker settings. It cannot override readiness gates.
