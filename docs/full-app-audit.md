# GoTrader AI Lab Full App Audit

Date: 2026-05-26

Scope: architecture, UX, research pipeline, LLM bridge, market data, auto research, self-improvement, readiness, simulation bridge, performance reliability, documentation, and safety. This audit is report-only and does not change readiness rules, strategy logic, broker behavior, or execution permissions.

## 1. Executive Summary

GoTrader AI Lab has become a broad research platform with strong safety boundaries. The app now covers imported historical data, LLM advisory review, deterministic and LLM-style agents, debate, audit, auto research, self-improvement proposals, readiness gating, simulated performance, and local bridge workflows. The main direction is sound: use the app as the command center, keep brokers disconnected, and require explicit user approval before research calibration changes become active.

The largest issue is not missing features. It is state and source-of-truth complexity. Metrics, active calibration, imported data settings, LLM status, proposals, readiness inputs, and research cycle summaries are stored across many localStorage keys plus IndexedDB. Several pages now label metrics more clearly, but the architecture still needs one canonical runtime snapshot that every page reads from.

The second major issue is mock versus imported data drift. Dashboard and Backtest Lab can use imported MNQ candles through safe windowing, but some standalone validation and research quality flows still carry mock-data assumptions or UI copy. That creates a risk that users compare results from different data sources without realizing it.

The third major issue is browser performance. Safe imported-data mode is a useful guard, but Auto Research still has synchronous candidate loops. Advanced or accidental larger imported-data runs can still freeze the browser. A worker-backed or chunked research executor should be the next reliability milestone.

Overall recommendation: pause new feature expansion briefly and consolidate the platform around a canonical research runtime, active data source awareness, async execution, and a state diagnostics layer. Then continue improving market-context realism and LLM-driven research.

## 2. Current Architecture Map

### Application Shell

- `src/App.tsx` defines the main route surface.
- `src/components/AppShell.tsx` provides grouped navigation and a persistent safety frame.
- Key routes include Dashboard, Communications, Research, ICT Lab, Agent Debate, Agent Audit, LLM Agents, Market Data, Replay, Backtest Lab, Validation, Research Quality, Readiness Gate, Self-Improvement, Auto Research, Advisory Agents, Simulation Runbook, Performance, and Settings.

### Command Center

- `src/components/dashboard/ResearchCommandCenter.tsx` is the main monitoring page.
- `src/components/dashboard/ResearchCycleControl.tsx` starts the AI Research Cycle.
- Dashboard pulls summaries from market data, LLM state, auto research, validation, self-improvement, readiness, simulated performance, and agent audit.

### Research Cycle

The sequential pipeline in `src/lib/researchCycle/runResearchCycle.ts` does the most orchestration:

1. Resolve active backtest config and active calibration.
2. Prepare candles from imported or mock market data with safe limits.
3. Generate or refresh thesis context.
4. Run backtest.
5. Run LLM advisory review through the local bridge when available.
6. Run Auto Research and adaptive improvement.
7. Run validation suite.
8. Run research quality review.
9. Create or update self-improvement proposal.
10. Update simulation runbook status.
11. Evaluate readiness gate.
12. Store compact cycle and canonical performance summaries.

This is the right high-level separation, but it needs a shared runtime snapshot so all pages use the same data source, settings, cycle id, calibration id, and metric source.

### Market Data Flow

- Historical import lives in `src/lib/marketData/historicalCandleImport.ts`.
- Imported candle arrays are stored in IndexedDB.
- Active import id and window settings are stored in localStorage.
- `src/lib/marketData/candleWindowing.ts` handles safe/standard/advanced presets, latest-N windows, session filtering, and 1m to 5m/15m aggregation.
- Dashboard safe mode uses a smaller imported-data window to protect the browser.

### LLM Flow

- LLM types, prompts, provider abstraction, local bridge client, and validators live in `src/lib/llm`.
- The local bridge server is `scripts/llm-local-bridge-server.mjs`.
- The secure GPT provider is `scripts/gpt55-llm-agent-provider.mjs`.
- Browser code calls only the local bridge, not OpenAI directly.
- API keys stay in the local PowerShell/server environment.
- Validator requires all 14 futures-context LLM reviewers and rejects execution authority, broker authority, readiness override authority, and unsafe language.

### Agent Framework

- Deterministic agent registry lives in `src/lib/agents/agentRegistry.ts`.
- Sector agents are deprecated in the main futures workflow.
- Futures market-context agents now cover session levels, auction/volume profile, macro event risk, intermarket confirmation, positioning/gamma, volatility regime, and planned order flow.
- Agent debate lives in `src/lib/agentDebate`.
- Agent audit lives in `src/lib/agentAudit`.

### Auto Research and Self-Improvement

- Auto Research lives in `src/lib/autoResearch`.
- It supports bounded candidate generation, multi-pass search, adaptive passes, zero-trade recovery, trade-quality diagnostics, compact state persistence, and proposal creation.
- Self-improvement lives in `src/lib/selfImprovement`.
- It now has approval checks, no-op detection, canonical proposal snapshots, active calibration persistence, and active config resolution.

### Readiness and Simulation

- Readiness gate lives in `src/lib/readiness`.
- Simulation runbook lives in `src/lib/simulationRunbook`.
- Simulation bridge and handoff remain research/simulation-only.
- Broker execution is not enabled by these layers.

### Storage Surface

Storage is currently split across many keys and subsystems, including:

- `gotrader-ai-lab-state`
- `gotrader_ai_lab_latest_validation_report`
- `gotrader_ai_lab_simulation_runbook`
- `gotrader_ai_lab_auto_research_state`
- `gotrader-ai-lab-backtest-config`
- `gotrader-ai-lab-ict-scoring-weights`
- `gotrader_ai_lab_llm_research_state`
- `gotrader_ai_lab_agent_audit_state`
- `gotrader_ai_lab_agent_debate_state`
- `gotrader-ai-lab-bridge-verification`
- `gotrader-ai-lab-candle-window-settings`
- IndexedDB database `gotrader-ai-lab-market-data`

This is the biggest architecture risk. The system is usable, but long-term reliability needs a canonical read facade and migration strategy.

## 3. What Is Working Well

### Safety Boundaries

- Frontend does not store OpenAI API keys.
- LLM calls go through a local server boundary.
- LLM responses are advisory-only and validated.
- Readiness gate blocks Paper-Demo Candidate unless required checks pass.
- Manual approval and readiness approval are separate from any broker action.
- Broker execution, live trading, Tradovate, TopStep, API keys, websocket feeds, and multi-account behavior remain out of scope.

### Dashboard Direction

- Dashboard is becoming the correct command center.
- It exposes system mode, safety locks, LLM status, auto research, validation, self-improvement, readiness, simulation bridge, market data, and performance.
- Search depth selection has returned to the research cycle control.
- Simulated account performance is clearly marked as simulation-only.

### Imported Historical Data Support

- XLSX/CSV import exists.
- Imported candles are validated and stored outside localStorage.
- Windowing and aggregation reduce browser load.
- Safe imported-data mode defaults to smaller windows.
- Imported versus mock source is increasingly visible in the UI.

### LLM Bridge

- `/health` exists and makes bridge verification easier.
- CORS is limited to local Vite dev ports.
- The bridge binds to `127.0.0.1`.
- The frontend does not call OpenAI directly.
- The provider requests structured JSON and rejects unsafe responses.

### Self-Improvement Controls

- Approval is no longer a simple button flip.
- It checks authority, simulation mode, proposal status, no-op comparisons, material improvement, critical regressions, and snapshot mismatch.
- Active calibration persistence and config resolution have improved.
- Proposal metrics now carry source metadata.

### Readiness Gate

- The gate is strict.
- Missing LLM review blocks Paper-Demo Candidate in real research mode.
- Zero-trade and sample-size blockers are recognized.
- The dashboard now separates actual blockers, passed requirements, warnings, and next action more clearly.

## 4. Critical Issues

### 1. Too Many State Sources

The app has many localStorage keys plus IndexedDB. That creates drift risk:

- Dashboard can read latest research cycle metrics.
- Performance reads canonical cycle metrics.
- Self-Improvement reads proposal snapshots.
- Backtest Lab reads active config and market data settings.
- Readiness reads validation, research quality, runbook, LLM, and active proposal state.

The labels are better now, but the architecture still lacks one canonical `ResearchRuntimeSnapshot`.

Impact: stale state, confusing metric differences, duplicate repair logic, and hard-to-debug page reload behavior.

### 2. Mock Versus Imported Data Drift

Dashboard research cycles can use imported MNQ candles through windowing, but some standalone pages and docs still reference mock OHLC replay. In particular, the standalone validation UI still appears to be mock-oriented, while the research cycle can call validation with prepared candles.

Impact: users can run different pages and believe they are comparing the same data when they are not.

### 3. Synchronous Auto Research Loops Remain a Crash Risk

Safe imported-data mode helps, but Auto Research still evaluates candidate loops synchronously. Candidate counts, adaptive passes, validation, and diagnostics can still pressure the browser, especially in advanced mode.

Impact: imported-data runs can freeze or crash the page if limits are raised or combined with heavy workflows.

### 4. LLM Bridge Health Does Not Prove Provider Readiness

`/health` proves the local bridge server is running. It does not prove:

- `OPENAI_API_KEY` is configured.
- The model is reachable.
- The provider command can complete.
- The latest validation schema will pass.

Impact: the UI may show bridge running while the next advisory run still fails due to provider configuration.

### 5. Documentation Drift

Some docs still mention mock-data backtests or older safe-window assumptions. The code has moved quickly, and docs have not fully converged.

Impact: beginner users may follow stale guidance.

### 6. Market Context Agents Are Mostly Planning or Mock Inputs

Futures market-context agents are the right direction, but many inputs are not real yet:

- Macro calendar.
- Intermarket ratios.
- Gamma and positioning.
- Volume profile and auction context.
- Order flow.

Impact: the app must keep showing which parts are real imported OHLCV versus mock/planned context, or confidence can look stronger than the evidence supports.

### 7. Proposal and Metrics Reliability Is Better, But Still Complex

The system now blocks no-op proposals and labels different metric sources. However, proposal creation, Dashboard display, Performance display, and Self-Improvement approval still depend on several layers of stored summaries and repair paths.

Impact: a canonical metrics facade and tests are needed before the app can be trusted for repeated research iterations.

## 5. High-Priority Fixes

1. Create a canonical `ResearchRuntimeSnapshot` resolver.
2. Make Dashboard, Backtest Lab, Validation, Research Quality, Performance, Readiness, Auto Research, and Self-Improvement read from that resolver.
3. Make standalone `/validation` and `/research-quality` active-data aware.
4. Convert Auto Research to async/chunked or Web Worker execution.
5. Add a richer LLM bridge `/status` endpoint that reports provider configured, model, last run, last error, and schema version.
6. Add a storage diagnostics page or advanced Settings panel for all key state sources.
7. Add automated regression tests for active calibration merge, no-op proposal rejection, readiness blocker classification, LLM response validation, and candle aggregation.
8. Update docs to remove stale mock-only and old safe-window assumptions.

## 6. Medium-Priority Improvements

- Add cancel button and progress checkpoints for AI Research Cycle.
- Add cycle history selector so users can compare runs intentionally.
- Add data-source badges to every metric table.
- Add explicit "real imported OHLCV" versus "mock/planned market context" tags in agent output.
- Add candidate result export for Auto Research.
- Add a compact "what changed since last run" card on Dashboard.
- Add LLM bridge timeout and retry controls.
- Add import validation for timezone assumptions and regular trading hours versus Globex sessions.
- Add a manual macro event calendar import before any API integration.
- Add a "safe evidence score" that downweights mock/planned context in readiness and agent confidence.

## 7. Low-Priority Polish

- Simplify repeated safety text further by using one persistent page-level banner plus concise local warnings.
- Tighten labels for beginner users, especially confluence, confidence, R multiple, validation, and readiness.
- Add "why this matters" tooltips rather than long paragraphs.
- Use a consistent empty-state pattern across all pages.
- Add direct links from proposal cards to source cycle and source candidate details.
- Add a compact cycle result receipt after each AI Research Cycle.

## 8. Technical Debt

### Storage

LocalStorage and IndexedDB are used directly in many modules. The app needs a storage facade with:

- Typed selectors.
- Schema versions.
- Migrations.
- Compact write helpers.
- Event broadcasting.
- Recovery and repair hooks.

### Metrics

Canonical metrics now exist, but not every page is structurally forced to use them. Proposal snapshots, latest cycle metrics, active baseline metrics, and recomputed previews should all come through one metrics access layer.

### Async Execution

The research cycle itself is async, but Auto Research and candidate evaluation still do heavy synchronous work. This is the most important stability debt for imported data.

### Docs

Feature docs were created incrementally. They now need a pass that aligns all pages with:

- Imported versus mock data.
- Safe/standard/advanced presets.
- LLM bridge health versus provider readiness.
- No-op proposal rules.
- Research calibration versus Paper-Demo Candidate review.

### Tests

The app is missing a visible test harness for the behaviors that have caused repeated issues:

- Active calibration persistence.
- Proposal visibility.
- Proposal metrics consistency.
- No-op proposal classification.
- Imported-data windowing and aggregation.
- LLM response validation.
- Readiness blocker classification.
- Auto Research storage pruning.

## 9. UX Simplification Recommendations

Dashboard should remain the primary command center. The default view should keep answering:

1. What is the system doing?
2. Is anything blocked?
3. What does the AI recommend?
4. What action does the user need to take?
5. Is execution still disabled?

Recommended UX changes:

- Keep technical traces under Advanced Details by default.
- Show one prominent next action, not several competing ones.
- In Self-Improvement, lead with proposal verdict, material change, and approval safety.
- In Market Data, lead with source, window, timeframe, and whether data is real imported or mock.
- In LLM Agents, separate bridge running from provider ready.
- In Auto Research, summarize only best candidate, top failed gates, and next targeted search on the main view.
- In Readiness Gate, keep failed blockers, passed requirements, warnings, and approval status separate.

The app is already moving toward this model. The next step is consistency.

## 10. Data and Metrics Consistency Review

### Current Strengths

- `CanonicalPerformanceMetrics` gives Dashboard and Performance a shared cycle-level metric model.
- Proposal snapshots carry source metadata.
- UI now labels proposal snapshot versus latest research cycle metrics.
- Self-Improvement can detect no-op and mismatch cases.

### Remaining Risks

- Dashboard, Performance, Self-Improvement, Auto Research, and Backtest Lab can still display different metric scopes by design.
- The labels help, but a user can still compare latest cycle metrics against proposal candidate metrics without realizing they are different runs.
- Some pages recompute or derive summaries locally.
- Imported-data settings can differ between page display and dashboard safe-mode runtime.

### Recommendation

Create a single metrics and runtime selector layer:

- `getLatestResearchCycleMetrics()`
- `getActiveBaselineMetrics()`
- `getProposalSnapshotMetrics(proposalId)`
- `getCurrentMarketDataScope()`
- `getResolvedBacktestConfig()`
- `getMetricSourceComparison(a, b)`

Pages should render only what those selectors return.

## 11. LLM and Agent Review

### What Works

- The required reviewer set is futures-focused.
- All 14 reviewers are required by validation.
- Unsafe responses are rejected.
- Browser does not hold API keys.
- Local bridge keeps the provider boundary outside React.
- Agent audit and debate provide explainability scaffolding.

### Fragile Areas

- Bridge health does not prove provider/model readiness.
- LLM context must stay compact when imported data is active.
- Market-context reviewers may reason about planned inputs that are not real yet.
- LLM debate integration is more planning-oriented than fully provider-backed.

### Recommendation

Add an LLM provider readiness contract:

- `bridgeRunning`
- `providerConfigured`
- `modelConfigured`
- `lastAdvisoryRun`
- `lastValidationResult`
- `lastUnsafeRejection`
- `schemaVersion`

Then show these separately in Dashboard and LLM Agents.

## 12. Market Data Readiness Review

### What Works

- Imported MNQ OHLCV can be stored outside localStorage.
- Windowing and aggregation are implemented.
- Safe mode protects the dashboard path.
- Candle validation covers timestamp, OHLC numeric fields, sorting, duplicates, missing intervals, and invalid high/low relationships.

### Fragile Areas

- Custom browser XLSX parsing may be brittle across Excel exports.
- Imported OHLCV is real, but macro/intermarket/gamma/order-flow context is mostly mock or planned.
- Safe, standard, and advanced settings need consistent labels everywhere.
- Timezone and session definitions need explicit user confirmation.

### Recommendation

Before adding real APIs, add manual import support for:

- Macro event calendar.
- Prior day/week/month levels.
- Session templates and timezone.
- Volume profile summary.

This provides useful market context without broker integration or secrets.

## 13. Self-Improvement and Readiness Review

### What Works

- Active calibration approval is gated.
- Active calibration can be persisted and merged into the next baseline.
- Duplicate ineffective lower-confluence proposals are guarded.
- No-op proposals are blocked.
- Critical regressions can block approval.
- Readiness gate remains strict.

### Fragile Areas

- Proposal creation happens from multiple paths.
- Proposal visibility required repair logic.
- Proposal snapshots and latest-cycle metrics can be confused without labels.
- Approval writes active calibration and also saved backtest config, which is workable but increases source-of-truth complexity.

### Recommendation

Move all proposal creation through one service:

- `createProposalFromCandidate(candidate, baseline, sourceContext)`
- `validateProposalForDisplay(proposal)`
- `validateProposalForApproval(proposal)`
- `applyApprovedProposal(proposal)`

Then remove duplicate proposal shaping from Auto Research and Research Cycle.

## 14. Safety Review

### Strong Safety Controls

- No broker execution route was found in the frontend workflow.
- No direct OpenAI browser key pattern was observed.
- LLM and advisory responses require `executionAuthority: none`, `brokerAuthority: none`, and `readinessOverrideAuthority: none`.
- Readiness gate blocks Paper-Demo Candidate unless all checks pass.
- Auto Research cannot auto-approve proposals.
- Simulation runbook preserves broker execution skipped checks.

### Safety Gaps to Watch

- Future market data APIs must not be added through browser-visible secrets.
- Future Tradovate work should be designed as a separate provider boundary, not mixed into the current research bridge.
- Mock/planned context must not be treated as real evidence in confidence or readiness.
- Advanced imported-data mode must remain explicitly opt-in.

## 15. Recommended Next 10 Implementation Steps

1. Build a canonical `ResearchRuntimeSnapshot` resolver that returns active data source, window, timeframe, resolved config, active calibration, latest cycle metrics, latest proposal, LLM status, and readiness inputs.
2. Refactor Dashboard, Backtest Lab, Performance, Self-Improvement, Readiness, Auto Research, Validation, and Research Quality to read from the resolver instead of separate localStorage calls.
3. Make standalone `/validation` and `/research-quality` use the active imported/mock data source and show the same data-source badges as Dashboard.
4. Convert Auto Research candidate evaluation to an async chunked executor or Web Worker with progress, cancellation, and hard limits.
5. Add an LLM bridge `/status` endpoint that distinguishes server running, provider configured, model configured, last success, last error, and validation schema version.
6. Add explicit evidence-source labels to every futures market-context agent: imported OHLCV, derived from imported OHLCV, mock, manual, planned, or unavailable.
7. Create a unified proposal service for proposal creation, snapshot validation, no-op checks, approval checks, active calibration application, and repair.
8. Add regression tests or a local test harness for candle aggregation, LLM validation, active calibration merge, no-op proposal blocking, readiness blocker classification, and auto research storage pruning.
9. Update existing docs and UI copy to align with current Safe/Standard/Advanced imported-data behavior and to remove stale mock-only wording where imported data is supported.
10. After the browser research pipeline is stable for repeated imported-data cycles, design the next backend/worker milestone for heavy historical testing before considering any paper-demo integration work.

## Final Assessment

GoTrader AI Lab is on the right path. It is already safety-first, research-heavy, and increasingly explainable. The next best engineering move is consolidation, not expansion. Make one canonical runtime snapshot, make imported data consistently flow through validation and quality review, move heavy candidate evaluation out of the blocking UI path, and strengthen status diagnostics around LLM and market context evidence.

Do that, and the app will feel much less like a collection of powerful modules and much more like one coherent research system.
