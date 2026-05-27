# Evidence Quality Scoring

GoTrader AI Lab now tracks the quality of evidence used by agents, LLM reviewers, debate, readiness, and self-improvement.

## Evidence Source Classes

- `real_imported`: source data imported by the user, such as historical OHLCV.
- `derived_from_real`: facts calculated from real imported data, such as ICT structure or backtest results.
- `manual`: manually supplied research evidence.
- `mock`: bundled/local mock evidence used for UI testing and deterministic baselines.
- `planned`: adapter contract exists, but no real provider is active yet.
- `unavailable`: evidence is not present.

## Evidence Categories

The ledger scores:

- OHLCV candles
- ICT structure
- session levels
- VWAP / volume profile
- macro calendar
- VIX / DXY / yields
- intermarket context
- COT / positioning
- gamma levels
- order flow
- LLM advisory review
- agent debate
- backtest results
- validation results
- readiness inputs

## Score Inputs

Each entry includes:

- `sourceType`
- `completeness`
- `freshness`
- `reliability`
- `coverage`
- `timestamp`
- `notes`
- `limitations`

The source class has the strongest influence. Real imported OHLCV scores higher than mock candles, and derived facts from imported data score higher than derived facts from mock data. Planned and unavailable evidence reduces confidence.

## Readiness Impact

Evidence quality can warn or reduce confidence, but it cannot approve readiness by itself.

If too much evidence is mock, planned, or unavailable, the runtime snapshot surfaces:

> Evidence quality insufficient for Paper-Demo Candidate.

This warning is shown on Dashboard, Evidence Quality, Readiness Gate, and related advanced diagnostics.

## LLM Context Impact

LLM context packets now include a compact `evidenceQualitySummary`, including source labels such as:

- imported OHLCV: `real_imported`
- ICT facts: `derived_from_real`
- macro: `planned` / `unavailable`
- intermarket: `planned` / `unavailable`
- order flow: `unavailable`

LLM reviewers must treat mock, planned, and unavailable evidence as weak or missing evidence, not confirmation.

## Agent Debate Impact

Agent Debate displays the evidence class used by its arguments. Deterministic facts remain immutable, but the debate should distinguish real evidence from mock or planned evidence when confidence changes.

## Safety

Evidence quality is a research/read-model layer only.

It cannot:

- execute trades
- enable demo/live mode
- approve readiness
- override readiness gates
- connect to brokers
- store API keys
