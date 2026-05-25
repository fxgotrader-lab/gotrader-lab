# Adaptive Auto Research

GoTrader AI Lab uses adaptive Auto Research to keep the configuration search honest. If the first bounded pass does not find a stable candidate, the system diagnoses the failed stability gates and runs up to two targeted follow-up passes.

This is simulation research only. Auto Research cannot execute trades, enable paper/demo/live mode, modify broker settings, override readiness, or approve its own proposals.

## Pass Order

1. Initial pass: tests the selected quick, standard, deep, session, stop-model, long/short, or conservative search mode.
2. Targeted pass 1: diagnoses the best failed candidate and creates follow-up candidates for the failed gates.
3. Targeted pass 2: repeats the diagnostic loop once more if the previous pass still fails.

The loop stops after the allowed passes. It does not keep searching until success.

## Failed Gates

Adaptive passes can target:

- `max_drawdown_too_high`
- `false_positives_too_high`
- `average_r_too_low`
- `win_rate_too_low`
- `trade_count_too_low`
- `confidence_calibration_weak`
- `session_consistency_weak`
- `conservative_scenario_unstable`
- `skipped_signal_imbalance`
- `overfitting_risk`

## Targeted Adjustments

Each follow-up candidate changes one variable or a small grouped set:

- High drawdown: stricter confluence/confidence, structure stop, FVG invalidation, or best-session filter.
- High false positives: NY AM only, stricter confluence, higher confidence, or reduced weak-session exposure.
- Weak average R: target R variants, stop-model variants, or low-R session exclusion.
- Low win rate: long-only/short-only comparison, session filter, or higher confidence.
- Too few trades: slightly lower threshold, wider session filter, or both long/short if safe.
- Weak confidence calibration: confidence penalty and rerun validation.
- Weak session consistency: session-focused candidates.
- Conservative instability: conservative-only candidates.
- Skipped signal imbalance: threshold comparison.
- Overfitting risk: simpler candidates with fewer changed variables.

## Result Categories

- `no_safe_candidate_found`: no candidate cleared the stability gate.
- `improved_but_not_ready`: a candidate improved stability, but not enough for readiness.
- `research_ready_candidate`: a candidate may be useful for research calibration.
- `paper_demo_candidate`: a candidate deserves readiness review, but still cannot enable demo execution.
- `unsafe_overfit`: the result looks too fragile or too dependent on a small sample.
- `max_passes_exhausted`: the allowed adaptive passes finished without a safe candidate.

## Self-Improvement Proposals

If a candidate improves stability, Auto Research may create a calibration proposal. The proposal is always approval-required:

- Improved but not Paper-Demo Candidate becomes a research calibration candidate.
- Paper-Demo Candidate becomes a paper-demo candidate review.
- Neither proposal can enable broker/demo/live trading.
- Active settings do not change until the user approves the proposal in Self-Improvement.

## Why Success Is Not Forced

A failed result is useful information. If no safe configuration exists after the bounded passes, the correct output is: continue research. The system should not keep searching until it finds a lucky backtest, because that increases overfitting risk.

