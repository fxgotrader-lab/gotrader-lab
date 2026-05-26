# Research Runtime Snapshot

The Research Runtime Snapshot is the canonical read model for GoTrader AI Lab. It does not change strategy logic, readiness logic, broker behavior, or stored data. It reads the current app state, normalizes labels, and returns one compact snapshot that major pages can use.

## Why It Exists

The app stores useful research state in several places:

- Main lab state in localStorage.
- Imported historical candles in IndexedDB.
- Candle window settings in localStorage.
- Active backtest config in localStorage.
- Active research calibration in localStorage.
- Research cycle summaries in localStorage.
- LLM advisory state in localStorage.
- Validation and research-quality reports in localStorage.
- Self-improvement proposals in localStorage.
- Simulation runbook status in localStorage.

That is expected for a local-only app, but it can create confusing UI drift. Dashboard, Performance, Self-Improvement, Readiness, Validation, Backtest Lab, Market Data, and Auto Research should not each invent their own version of "current state."

The runtime snapshot gives them a shared read model.

## Files

- `src/lib/runtime/researchRuntimeTypes.ts`
- `src/lib/runtime/resolveResearchRuntimeSnapshot.ts`
- `src/lib/runtime/runtimeSelectors.ts`
- `src/lib/runtime/index.ts`

## Snapshot Contents

The snapshot includes:

1. Runtime identity
   - `snapshotId`
   - `generatedAt`

2. Market data state
   - Active data source.
   - Source label.
   - Symbol, contract, and timeframe.
   - Raw candle count.
   - Research window.
   - Processed candle count.
   - Data preset.
   - Imported/mock flags.

3. Active config state
   - Resolved backtest config.
   - Default config.
   - Saved config.
   - Active research calibration.
   - Active calibration id.
   - Applied patch.
   - Config merge status.
   - Resolved confluence threshold.

4. Latest research cycle
   - Cycle id, status, timestamp.
   - Canonical metrics.
   - Thesis summary.
   - Backtest summary.
   - Validation summary.
   - Research quality summary.
   - Readiness summary.

5. LLM state
   - Provider status.
   - Bridge status when supplied by the caller.
   - Latest LLM run.
   - Missing reviewers.
   - Unsafe rejections.
   - Advisory pass state.

6. Proposal state
   - Latest proposal id.
   - Latest proposal.
   - Latest proposal snapshot.
   - Active approved proposal id.
   - Proposal source cycle id.

7. Readiness state
   - Readiness state.
   - Actual blockers.
   - Passed requirements.
   - Warnings.
   - Next action.

8. Performance state
   - Canonical performance metrics.
   - Simulated account summary.

9. Diagnostics
   - Source trace.
   - Stale state warnings.
   - Mismatch warnings.
   - Storage keys used.

## What It Detects

The resolver returns warnings instead of crashing. It currently detects:

- Stored canonical metrics differing from derived latest-cycle metrics.
- Active calibration existing while the resolved config did not apply it.
- Imported data selected while the prepared source fell back to mock candles.
- Proposal snapshot source cycle differing from the latest research cycle.
- Latest validation or research-quality records differing from the latest research cycle summaries.
- Simulation runbook referencing a different latest cycle.

## Pages That Should Use It

Dashboard and Performance now read core metrics and diagnostics from the snapshot when available. The next migration should move these pages to the snapshot fully:

- Backtest Lab.
- Market Data.
- Validation.
- Research Quality.
- Readiness Gate.
- Auto Research.
- Self-Improvement.
- Settings.
- LLM Agents.

## What Remains To Migrate

The snapshot is currently a canonical read layer, not a storage migration. It intentionally does not overwrite localStorage or IndexedDB.

Later work should:

1. Replace page-level storage calls with runtime selectors.
2. Make standalone Validation and Research Quality use the active data source.
3. Add a Settings diagnostics panel for storage key health.
4. Add tests for runtime mismatch detection.
5. Keep heavy imported-data processing outside the snapshot. The snapshot should stay compact.

## Safety Boundary

The runtime snapshot is read-only. It cannot execute trades, connect brokers, enable paper/demo/live trading, approve proposals, or override readiness gates.
