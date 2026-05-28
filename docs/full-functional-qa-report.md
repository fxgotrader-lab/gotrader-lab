# GoTrader AI Lab Full Functional QA Report

## Executive Summary

The app loads cleanly across the primary autonomous workflow and the advanced lab routes. Navigation works without requiring browser refreshes, including chart-backed pages that use the shared Lightweight Charts engine. The Dashboard now behaves more like mission control: primary navigation is reduced to the autonomous workflow, while older manual/research pages remain reachable through a collapsed Advanced Lab group or direct URL.

Two user-facing clarity fixes were applied during this audit:

- Primary navigation was simplified around Command Center operation.
- A shared "Why Not Ready?" explanation card was added where users compare performance/readiness: Command Center, Performance, Readiness Gate, and Self-Improvement.

No broker, demo, live-trading, Tradovate, API-key, websocket, readiness override, or order-execution surface was added or found in the tested flows.

## QA Method

Validation included:

- Production build with `npm run build`.
- Route smoke across all requested pages.
- Primary navigation click-through smoke.
- Advanced Lab expand and route click smoke.
- Chart navigation smoke across Dashboard, ICT Lab, Replay, Backtest Lab, and Market Data.
- Self-Improvement proposal-control smoke.
- Dashboard AI Research Cycle button smoke from Advanced details.
- Autonomous Research start/stop control smoke from Command Center.

The AI Research Cycle and autonomous loop were tested conservatively to verify control paths and page stability. Full long-running imported-data research and walk-forward optimization were not exhaustively benchmarked in this audit.

## Route-by-Route Status

| Route | Status | Notes |
| --- | --- | --- |
| `/dashboard` | Pass | Command Center loads, chart renders, runtime labels visible, Why Not Ready card visible. |
| `/market-data` | Pass | Loads with safety labels and chart preview; remains primary nav. |
| `/ict-lab` | Pass | Loads from Advanced Lab/direct URL; chart renders without navigation breakage. |
| `/replay` | Pass | Loads from Advanced Lab/direct URL; replay chart renders and route changes cleanly. |
| `/backtest-lab` | Pass | Loads with runtime/data labels and chart preview. |
| `/validation` | Pass | Loads as advanced page with runtime-aware labels. |
| `/research-quality` | Pass | Loads as advanced page with runtime-aware labels. |
| `/readiness-gate` | Pass | Loads, safety banner visible, Why Not Ready card visible. |
| `/self-improvement` | Pass | Loads, proposal controls visible, no-op/invalid approval disabled when applicable. |
| `/auto-research` | Pass | Loads as advanced page with safety labels. |
| `/walk-forward` | Pass | Loads as primary workflow page with runtime/source labels. |
| `/research-maturity` | Pass | Loads as diagnostics page. |
| `/evidence-quality` | Pass | Loads as diagnostics page. |
| `/agent-debate` | Pass | Loads as diagnostics page. |
| `/agent-audit` | Pass | Loads as diagnostics page. |
| `/llm-agents` | Pass | Loads as diagnostics page with LLM status controls. |
| `/autonomous-research` | Pass | Loads as primary workflow page. |
| `/communications` | Pass | Loads as primary workflow page. |
| `/performance` | Pass | Loads, canonical metric source visible, Why Not Ready card visible. |
| `/simulation-runbook` | Pass | Loads as diagnostics page. |
| `/settings` | Pass | Loads as primary system page. |

## Navigation Simplification

Primary navigation now contains only:

- Command Center
- Market Data
- Autonomous Research
- Walk-Forward
- Self-Improvement
- Readiness
- Performance
- Communications
- Settings

Advanced pages are still reachable through the collapsed Advanced Lab area:

- ICT Lab
- Replay
- Backtest Lab
- Validation
- Research Quality
- Auto Research
- Research Workbench
- Agent Debate
- Agent Audit
- LLM Agents
- Evidence Quality
- Research Maturity
- Simulation Runbook
- Advisory Agents
- Agent Roster
- Prompt Lab

No routes were deleted.

## Key Flow Status

| Flow | Status | Notes |
| --- | --- | --- |
| Start autonomous loop from Command Center | Pass | Start button switched to running state and Stop became enabled. |
| Stop autonomous loop | Pass | Stop action was accepted; no console errors. |
| Run AI Research Cycle from Advanced details | Pass | Button triggered without page crash or console errors. |
| LLM bridge status handling | Pass (route smoke) | LLM page loads and surfaces bridge controls/status; live bridge was not required for this QA pass. |
| Market data state | Pass (route smoke) | Market Data loads with source labels and chart preview. |
| Safe/Standard preset controls | Pass (route smoke) | Controls/page load remained stable; exhaustive preset persistence retest was not repeated here. |
| Walk-forward page | Pass (route smoke) | Page loads; full multi-window run not repeated in this audit. |
| Self-Improvement latest proposal | Pass | Proposal panel loads; approval disabled when current validation says it should be disabled. |
| No-op proposal approval block | Pass | Current page showed no-op/approval warning state and disabled approval button. |
| Active calibration display | Pass (route smoke) | Active configuration/runtime labels remain visible in relevant pages. |
| Dashboard/Performance metric source clarity | Pass | Both pages show runtime/canonical source labels; Performance states it uses latest research cycle only. |
| Chart navigation | Pass | Dashboard, ICT Lab, Replay, Backtest Lab, and Market Data route changes worked without refresh or console errors. |

## Passing Areas

- Client-side navigation works without refresh across primary and advanced routes.
- Chart components render after route changes and do not block navigation.
- Runtime snapshot labels are present on the major pages that need canonical source context.
- Safety language remains visible across the tested surfaces.
- Self-Improvement approval controls remain gated and disabled when the proposal is not approval-safe.
- Command Center can start and stop the autonomous loop without exposing execution authority.

## Broken Areas Found

No blocking route-load, navigation, chart, or console-error failures were found in this pass.

## Confusing Areas Found and Fixed

### Too Many Top-Level Tabs

The earlier sidebar exposed almost every historical lab page at once, which made the autonomous workflow feel scattered. This was fixed by moving manual and diagnostic pages into Advanced Lab while keeping direct routes intact.

### Win Rate Appearing Strong While Readiness Fails

The UI could show a strong win rate while readiness, maturity, walk-forward, or proposal checks still failed. This is logically valid, but it was easy to misread. The new shared explanation card states that win rate is only one metric and lists the active blockers such as sample size, walk-forward evidence, evidence quality, maturity, and readiness blockers.

## Remaining Confusing Areas

- Some advanced pages are still dense because they preserve research/debug detail. They are now out of the primary path, but later passes should continue moving raw diagnostics behind progressive disclosure.
- The Dashboard and Results tab both exist; this is useful, but Command Center should remain the default operating surface.
- The large production bundle warning remains. It is not a functional failure, but code-splitting chart/research pages would improve load performance.

## Recommended Fixes

1. Add a small route-smoke Playwright script so this QA can be repeated automatically.
2. Code-split advanced lab routes and chart-heavy pages.
3. Add an explicit "latest cycle result" status chip after AI Research Cycle completes, so the outcome is easier to parse after a run.
4. Keep moving raw debug sections into Advanced details on older lab pages.
5. Add a lightweight "data preset changed" toast on Market Data and Dashboard to make Safe/Standard state transitions more obvious.
6. Add visual automated-test coverage for the Advanced Lab collapsed navigation.
7. Add a one-click "Open current blocker" route from the Why Not Ready card.
8. Add a compact QA health card in Settings that lists active storage keys and stale-state warnings.
9. Add chart memory/leak smoke to CI if a browser runner becomes available.
10. Keep broker/live/trading gates locked until a separate human-reviewed implementation phase.

## Safety Review

The tested UI remained research/simulation only. The Command Center can start research loops, but it does not approve Paper-Demo Candidate, send go-trader handoffs, connect Tradovate, or execute orders. Broker execution remains visibly disabled.

## Fixes Applied in This Audit

- Simplified primary navigation and moved advanced pages into a collapsed Advanced Lab group.
- Added the shared `WhyNotReadyCard` to Command Center, Performance, Readiness Gate, and Self-Improvement.
- Preserved direct route access for all advanced pages.

