# GoTrader AI Lab Next Steps Roadmap

This is the concise implementation roadmap from the full app audit. It keeps the system research/simulation-only. Broker execution remains disabled.

## Current Status

GoTrader AI Lab has the main pieces in place:

- Dashboard command center.
- Imported MNQ historical data support.
- Safe imported-data windowing.
- LLM advisory bridge through localhost.
- Futures-focused LLM reviewer set.
- Agent debate and audit scaffolding.
- Auto Research and adaptive improvement.
- Self-improvement proposals with approval gates.
- Readiness gate and simulation runbook.
- Simulated performance dashboard.

The app is safest and most useful when the user runs research from Dashboard, reviews proposals in Self-Improvement, checks readiness, and keeps all execution disabled.

## Biggest Risks

1. State is spread across many localStorage keys plus IndexedDB.
2. Some pages still carry mock-data assumptions while Dashboard can use imported MNQ data.
3. Auto Research can still be heavy for imported historical data.
4. Bridge health proves the bridge is running, but not that the GPT provider is fully ready.
5. Market-context agents are futures-focused, but many context inputs are still mock or planned.
6. Proposal and metric labels are improved, but the app still needs one canonical source layer.

## Recommended Implementation Order

1. Create one canonical research runtime snapshot.
   - Include active data source, candle window, timeframe, resolved config, active calibration, latest metrics, LLM state, latest proposal, and readiness inputs.

2. Make all major pages read from that snapshot.
   - Dashboard, Backtest Lab, Performance, Self-Improvement, Readiness, Auto Research, Validation, and Research Quality should stop resolving state independently.

3. Make Validation and Research Quality imported-data aware.
   - They should use the same active imported/mock data source and source labels as Dashboard.

4. Move Auto Research to async or worker-backed execution.
   - Add progress, cancellation, chunking, and stricter browser limits.

5. Add a richer LLM bridge status endpoint.
   - Show bridge running, provider configured, model configured, last success, last error, and schema version separately.

6. Label every market-context evidence source.
   - Imported OHLCV, derived from imported OHLCV, mock, manual, planned, or unavailable.

7. Centralize self-improvement proposal logic.
   - One service should create, validate, compare, approve, reject, apply, and repair proposals.

8. Add regression checks for fragile workflows.
   - Active calibration merge, no-op proposal blocking, proposal visibility, readiness blockers, LLM validation, candle aggregation, and storage pruning.

9. Refresh docs and beginner-facing labels.
   - Remove stale mock-only wording where imported data is supported.
   - Clarify Safe, Standard, and Advanced imported-data modes.

10. Design a backend or worker milestone for heavy historical testing.
   - Do this before any paper-demo integration planning.
   - Keep broker execution out of scope until the research pipeline is stable across repeated imported-data runs.

## Near-Term UX Improvements

- Show one recommended next action on Dashboard.
- Keep advanced/debug details collapsed.
- Add a cycle history selector.
- Add direct links from proposal cards to source cycle and source candidate.
- Show "different metric sources" warnings only when they matter.
- Make LLM bridge status say "server running" versus "provider ready."

## Safety Reminder

GoTrader AI Lab is a research and simulation system. LLM agents, Auto Research, Self-Improvement, Readiness, and Simulation Runbook cannot execute trades, approve trades, connect brokers, enable demo/live mode, or override readiness gates.
