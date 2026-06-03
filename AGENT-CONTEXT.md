# GoTrader AI Lab - AI Agent Context

## Read This First

GoTrader AI Lab is a TypeScript/Vite/React research workbench for ICT/Grinch futures-style analysis. It imports or reads candles, normalizes them through a canonical candle-source manager, runs deterministic regime classification, runs research agents, coordinates debate/CIO synthesis, evaluates evidence/maturity/readiness, and displays the workflow in a Command Center dashboard.

This system must never execute trades. MT5 and TradingView are read-only sources. Broker authority, execution authority, and readiness override authority are represented in code and are expected to remain `none`. Do not add order buttons, live broker connection flows, account mutation, position mutation, API keys in the frontend, or any path that turns research output into trade execution.

Current code is frontend-heavy and local-script assisted. There is no Python/FastAPI backend in the repo. The Command Center lives in `src/components/dashboard/`, not `src/components/command-center/`. Several docs still lag behind code, especially around MT5/TradingView source status, so read source before trusting docs.

## Critical Constraints

1. Never add broker execution. Enforced by `src/lib/brokers/brokerAuthorityPolicy.ts`, `src/lib/brokers/brokerRouter.ts`, `scripts/mt5-readonly-tool-policy.mjs`, and `scripts/start-mt5-readonly-bridge.mjs`.
2. Never expose MT5 order/account/position mutation. `scripts/test-mt5-readonly-safety.mjs` verifies blocked mutation tokens and forbidden endpoints.
3. Keep `executionAuthority`, `brokerAuthority`, and `readinessOverrideAuthority` set to `none` for read-only sources. See `src/lib/candleSources/candleSourceTypes.ts`, `src/lib/integrations/mt5/*`, and `src/lib/integrations/tradingview/*`.
4. Never add live trading UI controls. Smoke tests in `tests/smoke/routes.spec.ts` and `scripts/smoke-routes.mjs` fail on unsafe labels such as Place Order, Buy Market, Sell Market, Enable Live Trading, and Connect Live Broker.
5. Never store API keys in frontend code. LLM real calls are routed through `scripts/llm-local-bridge-server.mjs`; prompt templates in `src/lib/llm/llmPromptTemplates.ts` forbid key disclosure.
6. Do not treat MT5 CFD/proxy data as CME futures truth. MT5 source normalization labels broker symbols such as `USTECH` as read-only proxy data in `src/lib/integrations/mt5/mt5ReadOnlyNormalizer.ts`.
7. Do not silently switch research sources. Canonical eligibility and explicit selection are enforced in `src/lib/candleSources/candleSourceEligibility.ts` and `src/lib/candleSources/candleSourceManager.ts`.
8. Do not weaken readiness gates. Readiness, evidence, maturity, and walk-forward checks are handled in `src/lib/readiness/*`, `src/lib/evidence/*`, `src/lib/researchMaturity/*`, and `src/lib/walkForward/*`.

## Current Implementation Status

✅ React/Vite app shell, routing, collapsible sidebar, and Dashboard Command Center are built.
✅ Imported OHLCV storage and prepared backtest candle flow are built.
✅ Canonical Candle Source Manager is built for imported, MT5 read-only, TradingView MCP, mock, replay, and planned providers.
✅ MT5 read-only safe wrapper and frontend client are built, with safety tests.
✅ TradingView MCP read-only wrapper/client/storage are built as legacy/alternative source.
✅ Deterministic composite regime classifier is built and tested.
✅ Internal deterministic agent registry, run pipeline, debate, and CIO synthesis are built.
✅ Autonomous research loop, research cycle, readiness, evidence, maturity, and walk-forward orchestration are implemented.
🔄 Jesse-inspired metrics visibility is implemented as GoTrader-native reporting, with some values marked planned/unavailable when not computed.
🔄 LLM advisory bridge is implemented, but real use requires `OPENAI_API_KEY` and local bridge startup.
📋 Tradovate read-only provider is planned at type level only.
📋 MT5 execution and live broker execution are planned/blocked, not implemented.
📋 Monte Carlo robustness has planned/reporting surfaces but no complete engine found.
📋 Order-flow agent is a neutral planning stub.
❌ `rules.json` is not present.
❌ There is no Python/FastAPI backend directory in this repo.

## File Map for Common Tasks

Add a new agent
-> Read first: `src/lib/agents/agentTypes.ts`, `src/lib/agents/agentRegistry.ts`, `src/lib/agents/runAgents.ts`, `src/lib/agents/cioSynthesis.ts`.
-> Then modify: `src/lib/agents/agentTypes.ts` and `src/lib/agents/agentRegistry.ts`.
-> Also update: debate/metrics UI if the new agent should be visible.
-> Run after: `npm.cmd run build`, `npm.cmd run smoke:routes`, `npm.cmd run test:agent-bridge-contracts`.

Modify debate logic
-> Read first: `src/lib/agentDebate/runAgentDebateSession.ts`, `src/lib/agentDebate/debatePersistence.ts`, `src/components/communications/AgentDebateView.tsx`.
-> Then modify: debate orchestration only.
-> Run after: `npm.cmd run build`, `npm.cmd run smoke:routes`.

Change auto-apply eligibility rules
-> Read first: `src/lib/autonomousResearch/autoApplyResearchCalibration.ts`, `src/lib/autoResearch/configSearchSpace.ts`, `src/lib/autonomousResearch/runAutonomousResearchLoop.ts`.
-> Then modify: allowed fields and policy checks.
-> Safety check: verify no broker/live/API/readiness fields become eligible.

Add a new data source/adapter
-> Read first: `src/lib/candleSources/candleSourceTypes.ts`, `src/lib/candleSources/candleSourceEligibility.ts`, `src/lib/candleSources/candleSourceManager.ts`, `src/lib/candleSources/candleSourceStorage.ts`, `src/lib/marketData/marketDataSourceResolver.ts`.
-> Then modify: provider types, normalizer/client/storage, runtime snapshot, Dashboard, Market Data, and tests.
-> Also update: `src/lib/runtime/resolveResearchRuntimeSnapshot.ts`.

Add a new route or page
-> Read first: `src/App.tsx`, `src/components/layout/AppShell.tsx`, `tests/smoke/routes.spec.ts`, `scripts/smoke-routes.mjs`.
-> Then modify: router, nav, smoke tests, and the new component.

Modify walk-forward logic
-> Read first: `src/lib/walkForward/dataSplitter.ts`, `src/lib/walkForward/walkForwardOrchestrator.ts`, `src/lib/walkForward/stabilityAnalyzer.ts`, `src/lib/walkForward/walkForwardSourceResolver.ts`.
-> Then modify: split/source/stability files.
-> Run after: `npm.cmd run build`, `npm.cmd run smoke:routes`.

Change LLM prompts
-> Read first: `src/lib/llm/llmPromptTemplates.ts`, `src/lib/llm/llmAgentOrchestrator.ts`, `scripts/llm-local-bridge-server.mjs`, `scripts/gpt55-llm-agent-provider.mjs`.
-> Then modify: prompt templates and schema validation together.

Modify TradingView MCP bridge
-> Read first: `scripts/start-tradingview-mcp-bridge.mjs`, `scripts/test-tradingview-mcp-bridge.mjs`, `src/lib/integrations/tradingview/*`, `src/lib/marketData/marketDataSourceResolver.ts`.
-> Then modify: safe wrapper, client, normalizer, runtime state, and source resolution.

Modify MT5 bridge
-> Read first: `scripts/start-mt5-readonly-bridge.mjs`, `scripts/mt5-readonly-tool-policy.mjs`, `scripts/test-mt5-readonly-safety.mjs`, `src/lib/integrations/mt5/*`, `src/lib/candleSources/*`.
-> Safety check: run `npm.cmd run test:mt5-readonly-safety` before committing.

Change regime classifier
-> Read first: `src/lib/regime/regimeTypes.ts`, `src/lib/regime/compositeRegimeClassifier.ts`, `src/lib/regime/regimeAgentWeights.ts`, `src/lib/agents/runAgents.ts`.
-> Then modify: classifier, weights, and tests.
-> Run after: `npm.cmd run test:regime-classifier`.

Package as Electron desktop app
-> Read first: `package.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, local bridge scripts, and storage modules.
-> Key constraints: bridges are local processes, browser localStorage/IndexedDB are part of state, and no broker execution may be added.

Add a new walk-forward preset
-> Read first: `src/lib/walkForward/dataSplitter.ts`, `src/lib/walkForward/walkForwardTypes.ts`, `src/components/walk-forward/WalkForwardView.tsx`.
-> Then modify: preset type/options, UI labels, and any preset validation.

Change auto-apply eligible fields
-> Read first: `src/lib/autonomousResearch/autoApplyResearchCalibration.ts`, `src/lib/autoResearch/configSearchSpace.ts`.
-> Safety check: ensure prohibited broker/live/API/readiness fields remain blocked.

## Non-Obvious Dependencies

If you change canonical candle source fields, also update MT5/TradingView normalizers, market data resolver, runtime snapshot, Dashboard, Market Data, ICT Lab, and walk-forward source resolver.

If you add a new internal agent, update `InternalAgentId`, `researchAgentRegistry`, any UI display mapping, and debate/context surfaces if the agent should appear in communications.

If you change auto-apply rules, `scripts/test-agent-bridge-contracts.mjs` and autonomous research behavior may need review because the system assumes research-only calibration fields.

The autonomous loop reads runtime snapshot, research cycle state, walk-forward state, readiness, evidence, maturity, communication audit, and self-improvement state at runtime.

MT5 browser UI state does not inherit terminal environment variables. Persisted settings in `src/lib/integrations/mt5/mt5ReadOnlyClient.ts` control browser-side requested/broker symbol defaults.

## Known Gotchas

1. `src/components/command-center/` does not exist; use `src/components/dashboard/`.
2. `src/hooks/` does not exist; the main custom state hook is `src/lib/storage/useLabState.ts`.
3. `rules.json` does not exist; ICT/Grinch rules are TypeScript modules.
4. `src/lib/mockData.ts` contains UI/demo agent seeds that are not the same as `researchAgentRegistry`.
5. MT5 test defaults and wrapper defaults are not identical: the test falls back to `USTECH`, while the wrapper falls back to requested symbol if no broker symbol is configured.
6. TradingView MCP remains in code but is not the default workflow after the MT5-first changes.
7. Regime history has two storage paths: frontend localStorage and script-side JSONL.
8. `liveMarketDataStatus` can produce language that is separate from canonical active source state.
9. `createGoTraderHandoff.ts` sets safety flags false, but `validateGoTraderHandoff.ts` does not independently validate all of them.
10. `.env.example` is incomplete for bridge/test development; read scripts for required variables.

## State Management Rules

| Data type | Storage location | Key name | Notes |
| --- | --- | --- | --- |
| Primary lab state | localStorage | `gotrader-ai-lab-state` | `src/lib/storage/index.ts` |
| Sidebar collapsed | localStorage | `gotrader-ai-lab-nav-collapsed` | `src/components/layout/AppShell.tsx` |
| Imported candles | IndexedDB | `gotrader-ai-lab-market-data` | Stores imports/candles. |
| Active import id | localStorage | `gotrader-ai-lab-active-candle-import-id` | Import selection. |
| Canonical sources | IndexedDB | `gotrader-ai-lab-candle-sources` | Store `canonical_candle_sources`. |
| TradingView feed metadata | localStorage | `gotrader-ai-lab-tradingview-mcp-chart-feed` | Metadata only. |
| TradingView full candles | IndexedDB | `gotrader-ai-lab-tradingview-mcp` | Store `gotrader_tradingview_mcp_feeds`. |
| MT5 feed metadata | localStorage | `gotrader-ai-lab-mt5-readonly-active-feed` | Metadata only. |
| MT5 full candles | IndexedDB | `gotrader-ai-lab-mt5-readonly` | Store `gotrader_mt5_readonly_feeds`. |
| Communications | IndexedDB plus compact/session fallback | `gotrader-ai-lab-communications`, `gotrader_ai_lab_communication_audit` | Compact events only in localStorage fallback. |
| Debate sessions | localStorage | `gotrader_ai_lab_agent_debate_state` | Latest sessions. |
| Autonomous loop | localStorage | `gotrader_ai_lab_autonomous_research_state` | Loop history/state. |
| Research cycle | localStorage | `gotrader_ai_lab_research_cycle_state` | Compacted on quota errors. |
| Walk-forward | localStorage | `gotrader_ai_lab_walk_forward_state` | Latest runs. |
| Regime history | localStorage | `gotrader-ai-lab-regime-history` | App runtime; script test also writes JSONL. |

## Naming Conventions

- Component files use PascalCase, usually `FeatureView.tsx`, `FeatureCard.tsx`, or `FeatureShell.tsx`.
- Hook-like files can live outside `src/hooks`; current pattern includes `src/lib/storage/useLabState.ts`.
- Type files usually end with `Types.ts` or are grouped under feature folders, for example `researchCycleTypes.ts`, `candleSourceTypes.ts`, and `regimeTypes.ts`.
- Test scripts under `scripts/` use `test-*.mjs`.
- Bridge scripts use `start-*-bridge.mjs`, `diagnose-*.mjs`, and `stop/restart-*.mjs`.

## Testing Checklist

After most changes, run:

1. `npm.cmd run build` - verifies TypeScript and production build.
2. `npm.cmd run smoke:routes` - verifies routes and absence of unsafe live/order UI labels.
3. `npm.cmd run test:regime-classifier` - verifies deterministic regime classifier behavior.
4. `npm.cmd run test:mt5-readonly-safety` - required after MT5/source/safety changes.
5. `npm.cmd run test:agent-bridge-contracts` - useful after agent, bridge, or advisory contract changes.
