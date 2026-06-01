# Deterministic Composite Regime Classifier

GoTrader now includes a native deterministic market regime classifier for ES/NQ/YM intraday research. The classifier is implemented in TypeScript under `src/lib/regime` because this repository is a Vite/React application, not a FastAPI/Python backend. The requested `backend/agents/*.py` paths do not exist.

## External Reference

`bkuri/jesse-mcp` was reviewed as an external reference only. It exposes Jesse algorithmic-trading capabilities through MCP tools and optional HTTP transport, with Jesse/Python-oriented runtime assumptions. GoTrader does not integrate Jesse MCP in this phase, does not add PostgreSQL, does not add Redis, and does not add HMM/hmmlearn.

## Taxonomy

The classifier emits:

- `trend_bull`
- `trend_bear`
- `range_low_vol`
- `range_high_vol`
- `event_high_vol`
- `risk_off_crisis`
- `insufficient_data`

Each output also includes:

- `instantaneousLabel`
- `stableLabel`
- `transitionPending`
- `confidence`
- `dataQuality`
- `supportingFactors`
- `conflictScore`
- `scores.trend_strength`
- `scores.chop`
- `scores.volatility`
- `scores.risk_off`
- `scores.momentum`
- `scores.mean_reversion`
- `recommendedBehavior`
- `missingInputs`

## Inputs

Primary candle features:

- ATR ratio versus rolling baseline.
- Realized volatility percentile.
- Directional efficiency.
- VWAP distance, slope, and cross count.
- Opening-range expansion factor.
- Range compression and chop score.

Secondary/context features:

- VIX level.
- DXY/headwind context when available.
- 2s10s yield inversion when available.
- Economic event risk from the market context calendar.

If data is missing or too small, the classifier returns `insufficient_data` with confidence capped at `0.35`.

## Rule Model

The classifier is rule-based and auditable:

- Active high-impact event plus expanded volatility produces `event_high_vol`.
- Extreme volatility plus risk-off context produces `risk_off_crisis`.
- Strong directional efficiency, momentum, and VWAP alignment produce `trend_bull` or `trend_bear`.
- Low trend strength plus low volatility produces `range_low_vol`.
- Low trend strength plus elevated volatility produces `range_high_vol`.

Hysteresis prevents flip-flopping. A new instantaneous regime must persist before `stableLabel` changes; otherwise `transitionPending` is true.

## Integration

- Agent layer: `Composite Regime Agent` participates in deterministic agent debate.
- Agent weights: regime-aware weighting adjusts market-context, macro, structure, and range agents without creating execution authority.
- Runtime: `ResearchRuntimeSnapshot.regime` exposes the current regime for Command Center and downstream systems.
- LLM context: regime summary is included as supporting evidence.
- Walk-forward: each split records `regimeMetrics`, and stability summaries include `regimeSegments`.
- Autonomous safety: auto-apply is blocked or warned on `regime_transition_pending`, `regime_evidence_insufficient`, and `regime_specific_sample_too_small`.
- Command Center: shows current regime label, confidence, transition state, and data quality.

## History Logging

Browser runtime keeps a compact local history for hysteresis at:

`gotrader-ai-lab-regime-history`

Local development/test logging writes compact JSONL records to:

`state/regime_history.jsonl`

That JSONL file is generated local state and is ignored by git through the existing `*.jsonl` ignore rule.

## Safety

Regime classification is research-only. It cannot:

- place orders
- create execution intent
- connect brokers
- override risk
- override readiness
- approve paper/demo/live trading

Regime evidence is supporting context only. High confidence does not promote readiness without normal trade count, average R, drawdown, walk-forward, evidence quality, and maturity gates.

## Validation

Run:

```powershell
npm.cmd run build
npm.cmd run test:regime-classifier
npm.cmd run smoke:routes
git diff --check
```

