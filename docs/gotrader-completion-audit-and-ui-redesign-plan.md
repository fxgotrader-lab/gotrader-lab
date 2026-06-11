# GoTrader Completion Audit and UI Redesign Plan

Date: 2026-06-11
Audited at commit: `091d7c7` (Add safe OpenClaw pilot phased plan)
Scope: full codebase audit (routing, UI/UX, workflows, MT5 source consistency, Advisor/OpenClaw, ICT recognition/validation, performance, tests). Audit/planning pass only - no app code was changed.

---

## 1. Current App Status

GoTrader AI Lab is a local-first React 19 / Vite 7 / TypeScript research workbench with 28 routes, a deterministic 23-agent research pipeline, debate/CIO synthesis, autonomous research loop, walk-forward validation, readiness/evidence/maturity gates, an MT5 read-only safe wrapper (port 7341), a TradingView MCP legacy wrapper (port 7331), a local LLM bridge (port 8787), and OpenClaw phone/skill advisory bridges.

Overall state: **functionally deep, structurally overgrown.**

- The build passes cleanly (`tsc -b && vite build`) and all 30 Playwright smoke tests pass.
- All safety boundaries hold: `executionAuthority` / `brokerAuthority` / `readinessOverrideAuthority` are `none` everywhere, MT5 mutation is blocked at wrapper level, OpenClaw cannot auto-apply or override readiness.
- The MT5 read-only bridge is live and returning real symbols/candles in this environment.
- The cost of rapid feature growth is visible: 17 source files exceed 1,000 lines, the dashboard shell is 4,291 lines, the Advisor is 3,172 lines, the entire app ships as one 3.0 MB JS chunk, navigation has 26 sidebar destinations with heavily overlapping names, and the recognition -> hypothesis -> replay -> walk-forward -> evidence chain has several broken or manual-only links.

The app is at the "everything exists somewhere" stage. The work remaining is consolidation, wiring, and presentation - not new subsystems.

---

## 2. What Is Working

**Infrastructure and safety**
- Production build, TypeScript strict mode, and all 30 browser smoke tests pass.
- MT5 read-only safe wrapper: GET/OPTIONS only, mutation tokens blocked (403/405), all responses carry authority `none`. Verified live by `test:mt5-readonly` and `test:mt5-readonly-safety`.
- OpenClaw phone bridge and skill server: compact packet contract validated, execution requests refused, no secrets logged, `mt5Called: false`. `OPENCLAW_ADVISORY_URL` unset is correctly handled as `not_configured` (not a failure).
- Broker router/authority policy blocks execution intents by construction (`canCreateExecutionIntent` requires non-none authority, which never exists).
- Auto-apply calibration is whitelist-bounded, defaults disabled, human-toggled only, and not reachable from OpenClaw.

**Research pipeline**
- Canonical candle source manager with eligibility thresholds (5/100/400/1000 candles for chart/quick/research/walk-forward).
- Activate Market workflow (Advisor + Dashboard) activates MT5 as canonical research source independently of imported/mock sources.
- ICT universal recognition with tier model (`full_model` / `forming_model` / `pd_array_setup` / `scalp_setup` / `market_map_only` / `insufficient_data`) - all tiers pass `test:ict-universal-recognition`, raw candles excluded from packets, hypothesis auto-queue works.
- Research cycle runner with source guard (blocks mock candles for research), debate, CIO synthesis, readiness/evidence/maturity scoring.
- Walk-forward orchestrator with split presets, stability verdicts, and proposal validation status.
- Multi-symbol / multi-timeframe advisor workspace controls with HTF context selection, persisted to shared MT5 settings.
- CFD/proxy labeling (`USTECH -> MNQ`) present on Advisor, Market Data, Dashboard, ICT Lab, Replay, Walk-Forward, and the Paper-Demo checklist.
- Dashboard correctly carries only *compact* advisor panels (`IctAdvisorSummaryPanel mode="compact"`, `LLMAdvisoryReviewPanel mode="compact"`); the full advisor is not duplicated.

**Empty states that work well:** Research Advisor (loading shell -> Activate Market path), Replay ("Create Replay from Active MT5 Source"), Dashboard chart placeholder.

---

## 3. What Is Incomplete

Ranked by user impact:

1. **Advisor chat is deterministic, not advisory.** `buildLocalAdvisorReply` (ResearchAdvisorView.tsx ~294-355) does keyword routing. The real OpenClaw/LLM path exists but is buried in a collapsed `DeferredResearchDetails` accordion. The most prominent "ask the Advisor" surface never reaches an LLM or OpenClaw.
2. **Recognition -> validation chain has dead ends.** `RecognitionSummaryCard` renders "needs replay validation" as text only - no button/link to the replay panel (which is collapsed further down the same page). Hypothesis validation stops at queue update: results do not propagate to walk-forward, OOS, evidence ledger, maturity, or the Paper-Demo checklist.
3. **Hypothesis validation drops replay evidence.** `runHypothesisValidation` (ResearchAdvisorView.tsx ~868-873) passes only `replayOutcomes`/Monte Carlo outcomes, not `replayReview.replayResults`, weakening `findHypothesisOccurrences` matching in `ictHypothesisValidation.ts` (~87-103).
4. **OpenClaw stub masquerades as success.** The phone bridge stub returns `advisoryStatus: "complete"` (openclaw-phone-advisory-bridge.mjs ~288-297); the UI shows ready/online. The bridge `/health` endpoint exposes `stub` vs `connected` but the frontend never reads it. Users cannot distinguish stub / routed / offline.
5. **OpenClaw proposal intent is display-only.** `selfImprovementProposalIntent` from advisory responses is shown in `LLMAdvisoryReviewPanel` (~811-825) but never creates a draft `CalibrationProposal`; the user must manually re-enter it in Self-Improvement.
6. **Research cycle can only be run from the Dashboard.** Advisor Activate Market does not chain into "Run Research Cycle"; users must discover `ResearchCycleControl` inside the Dashboard's Advanced accordion.
7. **Hypothesis queue has no standalone UI.** Queueing happens implicitly during Activate Market; there is no manual "queue this hypothesis" action and no queue browsing page outside Self-Improvement internals.
8. **Walk-forward is decoupled from the MT5 selection.** It uses separate candle-window presets (`loadWalkForwardCandleWindowSettings`) and its own source resolver; it carries no hypothesis ID or recognition tier, so a walk-forward run cannot be traced back to the hypothesis it was meant to validate.
9. **Paper-Demo checklist is fragmented.** Full checklist lives in `MissionControlShell` (twice - summary band + full table in Advanced), blockers in Self-Improvement, gate approval in Readiness Gate, and `SimulationRunbookView` is a different checklist (handoff verification). No single Paper-Demo page.
10. **OpenClaw pilot plan phases are partially unimplemented.** `docs/openclaw-pilot-phased-plan.md` specifies named pilot statuses (`disabled`, `advisory_only`, `memory_dry_run`, `proposal_intent_draft`) and a `docs/openclaw/program.md` artifact; neither exists. No `test:openclaw-pilot-dry-run` script exists.
11. **Orphaned components.** ~16 dashboard/common components (`DashboardOverview`, `MissionControlStatusStrip`, `SystemStatusGrid`, `SafetyLockCard`, `AutomationTimeline`, etc.) are no longer rendered anywhere - superseded by inlined UI in `MissionControlShell`.
12. **Universal recognition invisible outside the Advisor.** Not surfaced in ICT Lab, Replay, or Walk-Forward.

---

## 4. Bugs Found

| # | Severity | Bug | Location |
|---|----------|-----|----------|
| B1 | High | ICT Lab silently analyzes **mock candles** when MT5 is not research-active: `fallbackPreparedSource` + `activeCandles = ... \|\| mockCandles`; the "fallback source active" badge is easy to miss while rich Grinch output renders. Highest false-confidence risk in the app. | `ICTLab.tsx` ~108-132, badge ~502-503 |
| B2 | High | Dashboard re-renders its entire ~4,291-line tree **every second** - a 1s interval for MT5/TV countdown labels stores state on the root shell. | `MissionControlShell.tsx` ~1638-1641 |
| B3 | High | OpenClaw stub responses report `advisoryStatus: "complete"`; UI displays success instead of stub state. | `openclaw-phone-advisory-bridge.mjs` ~288-297; `LLMAdvisoryReviewPanel.tsx` ~794 |
| B4 | Medium | `BacktestLab` runs `runBacktest` **twice on mount** (useState initializer + refresh effect) - duplicate synchronous backtests before first paint. | `BacktestLab.tsx` ~185, ~322 |
| B5 | Medium | Hypothesis validation omits `replayReview.replayResults`, weakening occurrence matching. | `ResearchAdvisorView.tsx` ~868-873; `ictHypothesisValidation.ts` ~87-103 |
| B6 | Medium | Chart display fallback returns research/mock candles with only a `fallbackReason` field when the MT5 chart feed is empty - warning surfaced inconsistently. | `marketDataSourceResolver.ts` ~179-194 |
| B7 | Medium | `loadPreparedCandleSource` failure inside the research cycle silently catches to `{ mode: "mock" }` (guard catches it later, but the silent catch hides the root cause). | `runResearchCycle.ts` ~615-633 |
| B8 | Medium | Smoke route lists are out of sync: `routes.spec.ts` covers 23 routes, `smoke-routes.mjs` covers 21 (missing `/advisor`, `/research-advisor`); neither covers `/research`, `/advisory-agents`, `/agents`, `/prompt-lab`. | `tests/smoke/routes.spec.ts` ~3-32; `scripts/smoke-routes.mjs` ~9-37 |
| B9 | Low | `loadMt5ReadOnlySettings()` is called synchronously on **every render** of MissionControlShell (localStorage read in render path). | `MissionControlShell.tsx` ~719 |
| B10 | Low | SettingsView uses `state.tradeTheses[0]` for TradingView test actions, which can differ from the MT5 symbol settings shown beside it. | `SettingsView.tsx` ~393-425 |
| B11 | Low | Replay play-loop interval restarts whenever the backtest object identity changes (`backtest` in deps). | `ReplayView.tsx` |
| B12 | Low | `.gotrader/` (~1,600 generated test-artifact files) is untracked but only partially gitignored (`journal/`, `imports/`, logs); the ~50 `*-test/` artifact dirs show as `?? .gotrader/` noise in git status. | `.gitignore` |
| B13 | Low | ARCHITECTURE.md route/component table is stale: misses `/advisor` + `/research-advisor`; lists six component folders that have since moved (`communications/AgentAuditView` -> `agent-audit/`, `evidence-quality/` -> `evidence/`, `maturity` paths, `backtest/` -> `backtest-lab/`, `advisory-agents/` -> `advisory/`). | `ARCHITECTURE.md` section 4 |
| B14 | Low | Bundle is one 3,035 kB chunk (790 kB gzip); Vite warns at build time. No `React.lazy`, no manualChunks. | `App.tsx`, `vite.config.ts` |

Pre-existing known gap (re-confirmed): `validateGoTraderHandoff.ts` does not independently re-verify every safety flag created by `createGoTraderHandoff.ts`.

---

## 5. UI Clutter Diagnosis

Two visual dialects coexist: a "mission control cockpit" style (Dashboard, Advisor: custom `rounded-[24px/28px]` panels, radial gradients, `tracking-[0.22em]` micro-labels, hand-rolled readout tiles) and a "card-based lab" style (Backtest, Walk-Forward, Replay: shadcn-style `Card` primitives). The token foundation (`src/components/ui/`, 9 primitives) is good but bypassed by the two biggest pages.

| Page | Sections/panels | Tabs? | Worst offenders |
|------|-----------------|-------|-----------------|
| Dashboard (`MissionControlShell`, 4,291 lines) | ~22 `<section>`s; **50+ panels** with Advanced open | 2 top tabs only | Paper-Demo checklist rendered **twice**; MT5 controls duplicated under "Developer Controls"; `ResearchCycleControl` (1,141 lines) + LLM review + advisor summary + chart on one page |
| Research Advisor (3,172 lines) | ~12 always-visible sections **before** the chat; 3-column chat; 7 deep-research accordions | None | Signal/Paper-Sim/CMD tracking cards visible before any data exists; real LLM/OpenClaw panel collapsed at the bottom |
| ICT Lab (1,173 lines) | **14** stacked Grinch phase cards | None | Diagnostic-dump feel; empty state looks broken rather than like onboarding |
| Market Data (1,870 lines) | ~10+ cards | None | Adapter cards + preview + "future modules" grid for what is a setup page |
| Walk-Forward (671 lines) | ~9 cards | None | Failure diagnostics + promotion gate + per-window table shown with zero runs |
| Backtest Lab (941 lines) | ~8 cards | None | Large config form + diagnostics always visible |
| Replay (551 lines) | ~7 cards | None | Two safety banners + source card before any replay exists |
| Settings (1,281 lines) | many | None | Bridge status + weights + multi-broker + reset in one scroll |

Navigation clutter: 26 sidebar destinations. Confusing pairs: "Research Advisor" vs "Advisory Agents"; "Autonomous Research" vs "Auto Research" (both Bot icons); five "am I ready?" pages (Validation, Research Quality, Readiness, Evidence Quality, Research Maturity); six agent-related pages. Icon collisions (`Bot` x4, `MessageSquareText` x2, `ClipboardCheck` x2, `DatabaseZap` x2) make the collapsed rail unscannable. `/advisor` and `/research-advisor` are duplicate URLs for the same page (sidebar uses one, dashboard deep-links use the other).

---

## 6. Proposed New Information Architecture

### App shell (target)

```
+--------------------------------------------------------------------------------+
| TOP SOURCE BAR: [MT5 ● connected] [MNQ <- USTECH (CFD proxy)] [5m | HTF: 1h,1d] |
|                 [Research source: MT5 active ✓] [Activate Market]              |
+----------+---------------------------------------------------+----------------+
| SIDEBAR  |  WORKSPACE TABS (per page where needed)           | RIGHT CONTEXT  |
|          |                                                   | PANEL          |
| Home     |  PRIMARY ACTION AREA                              | (collapsible:  |
| Advisor  |  (one clear "what do I do next" per page)         |  current read, |
| Data     |                                                   |  recognition,  |
| Validate |  page content                                     |  blockers,     |
| Evidence |                                                   |  next action)  |
| Automate |                                                   |                |
| Agents   |                                                   |                |
| Settings |                                                   |                |
+----------+---------------------------------------------------+----------------+
| STATUS/FOOTER SAFETY STRIP: Research-only · No broker execution · Authority:   |
| none/none/none · OpenClaw: stub|routed|offline · LLM bridge: up|down           |
+--------------------------------------------------------------------------------+
```

Key shell elements:
- **Top source bar** (new, global): the single source-of-truth selector for symbol / broker alias / timeframe / HTF context, plus source status and the Activate Market action. Eliminates the three competing pickers (Advisor, Market Data, Dashboard) - all pages read the same persisted MT5 settings and canonical source state they already share.
- **Right context panel** (new, global, collapsible): compact current read, recognition tier, top blockers, and the *one* recommended next action. Replaces scattered compact summary cards.
- **Status/footer safety strip** (new, global): authority triple, research-only notice, OpenClaw stub/routed/offline, LLM bridge status, MT5 connection. Replaces per-page repeated safety banners (keep `SafetyBanner` content, render it once).

### Sidebar consolidation: 26 items -> 8

| New nav item | Route | Absorbs |
|---|---|---|
| **Home** | `/dashboard` | Mission Control (slimmed): KPIs, chart, action-required, autonomous loop control |
| **Advisor** | `/advisor` | Research Advisor (tabbed; `/research-advisor` becomes a redirect) |
| **Data** | `/market-data` | Market Data + MT5/TradingView connection controls moved out of Dashboard/Settings |
| **Validate** | `/validate` (new hub) | Tabs: Backtest (`/backtest-lab`), Replay (`/replay`), Walk-Forward (`/walk-forward`), Validation Suite (`/validation`) - existing routes kept as deep links into tabs |
| **Evidence** | `/evidence` (new hub) | Tabs: Evidence Quality, Research Maturity, Research Quality, Readiness Gate, Paper-Demo Checklist (new dedicated tab), Simulation Runbook |
| **Automate** | `/automate` (new hub) | Tabs: Autonomous Research, Auto Research (rename: "Parameter Search"), Self-Improvement |
| **Agents** | `/agents-hub` (new hub) | Tabs: Research Committee/Debate, Agent Audit, Communications, LLM Agents, Advisory Agents (rename: "OpenClaw Bridge"), Agent Roster, Prompt Lab |
| **Settings** | `/settings` | Settings (slimmed: preferences, reset, env/bridge docs; connection controls move to Data) |

Rules: every legacy route keeps working via redirect or by mapping to a hub tab (smoke tests updated, not weakened). ICT Lab and Research Workbench fold into Advisor deep-research / Validate tabs respectively, or remain as "Advanced" deep links from those hubs.

---

## 7. Proposed Page-by-Page UI Redesign

### 7.1 Home (Dashboard)
- Keep: hero KPI strip (one row), chart, compact advisor summary, Action Required list, autonomous loop start/stop, Paper-Demo summary band (once).
- Move out: MT5 Developer Controls and symbol/TF form (-> top source bar / Data), full Paper-Demo table (-> Evidence hub), `ResearchCycleControl` deep panel (-> keep a single "Run Research Cycle" button; details into a drawer), Research Committee report (-> Agents hub), source consistency table (-> Data), TradingView controls (-> Data), performance marks / render counter (dev-only flag).
- Result: ~50 panels -> ~8. The "Advanced details" accordion disappears.

### 7.2 Advisor (the workbench)
Convert the 3,172-line single scroll into workspace tabs:
- **Overview** - Current Read + Recognition card + Market Opportunity + chat (chat moves up; 3-column layout retained on wide screens with the right context panel).
- **Hypotheses** - hypothesis queue (new explicit UI), validation panel, "needs replay validation" with a **Run Replay Review button** wired in.
- **Signals** - Research Signal / Paper Sim / CMD tracking (currently always visible; only show populated states).
- **Deep Research** - existing 7 accordions (replay, Monte Carlo, scorecard, profile optimizer, reports).
- **External Advisory** - LLM bridge + OpenClaw panel promoted out of the collapsed footer, with explicit stub/routed/offline state chips.
- Chat gains a provider selector: Local (deterministic) / LLM bridge / OpenClaw - clearly labeled, never silently local.

### 7.3 Data
- One "start here" stepper: 1) Connect bridge -> 2) Pick symbol/TF (same control as top bar) -> 3) Fetch/Activate -> 4) Verify eligibility.
- MT5 card, TradingView card (collapsed by default, labeled legacy), Import card, Active source inspection. "Future modules" grid removed or moved to docs.

### 7.4 Validate hub
- Wizard pattern per tab: Source -> Config -> Results. Hide diagnostics/promotion gate/per-window tables until a run exists.
- Walk-Forward gains hypothesis linkage: select a queued/validated hypothesis to attach the run to (closes the traceability gap).
- Replay page gains "recognition context" header when launched from a hypothesis.

### 7.5 Evidence hub
- Single Paper-Demo Candidate page assembled from `buildPaperDemoChecklist` - the one place to answer "how close am I?"
- Evidence Quality, Maturity, Research Quality, Readiness Gate as sibling tabs sharing one runtime snapshot fetch.

### 7.6 Agents hub
- Committee/debate front and center; audit/communications as tabs; OpenClaw Bridge tab shows pilot status (`disabled` / `advisory_only` / `memory_dry_run` / `proposal_intent_draft` per pilot plan) and stub/routed/offline from bridge `/health`.

### 7.7 ICT Lab
- Phase tabs (Phase 1-4, Score, SMT) instead of 14 stacked cards; single hero empty-state when no candles; **hard source banner** when analysis is running on fallback/mock data (fix B1: block analysis or require explicit "analyze fallback data anyway").

### 7.8 Visual system
- One dialect: extend `src/components/ui/` primitives (Card, StatTile, SectionHeader, StatusChip, EmptyState) and migrate the cockpit-style custom panels onto them. Standardize: page title row, section spacing `space-y-5`, label style, status colors (emerald/amber/rose only), and a shared `SourceBadge` component (requested symbol, broker alias, proxy warning) replacing the three hand-written proxy texts in ICT Lab/Replay/Walk-Forward.

---

## 8. Workflow Completion Checklist

| # | Workflow | Status | Notes / gap |
|---|----------|--------|-------------|
| 1 | Choose MT5 symbol/pair | ✅ (3 surfaces) | Consolidate to one global control (top source bar) |
| 2 | Choose timeframe | ✅ | Same consolidation |
| 3 | Choose higher-timeframe context | ✅ | Checkbox HTF picker; primary TF auto-stripped from HTF |
| 4 | Activate MT5 research mode | ✅ | Advisor + Dashboard entry points (shared lib) |
| 5 | Run research cycle | ⚠️ Partial | Dashboard-only; add post-Activate CTA in Advisor |
| 6 | View ICT recognition | ✅ | Advisor + compact dashboard; missing in ICT Lab/Replay/WF |
| 7 | Queue hypothesis | ⚠️ Partial | Implicit auto-queue only; no manual queue button or queue browser |
| 8 | Run replay validation | ⚠️ Partial | Two unlinked replay systems; recognition card has no CTA; `replayResults` not passed to validator |
| 9 | Run walk-forward validation | ⚠️ Partial | Works standalone; no hypothesis linkage; separate window settings |
| 10 | View evidence quality | ✅ | `/evidence-quality`; not updated by hypothesis validation |
| 11 | View maturity score | ✅ | `/research-maturity` |
| 12 | View Paper-Demo checklist | ⚠️ Partial | Fragmented across 4 surfaces; needs a dedicated page |
| 13 | Ask Advisor | ⚠️ Partial | Chat works but is deterministic-only; LLM/OpenClaw buried |
| 14 | Inspect Research Committee | ✅ | Dashboard Advanced + `/agent-debate`; should move to Agents hub |
| 15 | Create self-improvement proposal intent | ✅ | Manual + cycle import; OpenClaw intent not auto-drafted |
| 16 | Preserve source consistency | ⚠️ Partial | Research cycle guarded ✅; ICT Lab mock fallback ❌ (B1); chart fallback warnings inconsistent (B6) |

---

## 9. Safety Boundary Checklist

All verified by static audit + scripted tests on 2026-06-11:

| Boundary | Status | Evidence |
|----------|--------|----------|
| No broker execution | ✅ HOLDS | `brokerAuthorityPolicy.ts` blocked decisions; `canCreateExecutionIntent` unreachable; no order UI (smoke-enforced) |
| No live trading / order placement UI | ✅ HOLDS | smoke tests forbid Place Order / Buy Market / Sell Market / Enable Live Trading labels - 30/30 pass |
| No MT5 execution/mutation | ✅ HOLDS | wrapper GET/OPTIONS only; mutation tokens 403/405; `test:mt5-readonly-safety` pass |
| No account/order/position mutation | ✅ HOLDS | policy blocks account/order/position/deal/buy/sell/close/modify/cancel tokens |
| No readiness override | ✅ HOLDS | no non-`none` `readinessOverrideAuthority` assignment found in `src/` |
| No auto-apply by OpenClaw | ✅ HOLDS | `advisoryProviderClient.ts` forces `autoApplyAllowed: false`; intent is display-only |
| No direct calibration mutation by OpenClaw | ✅ HOLDS | no path from advisory response to `autoApplyResearchCalibration` |
| executionAuthority = none | ✅ HOLDS | all packet builders, normalizers, bridges |
| brokerAuthority = none | ✅ HOLDS | same |
| readinessOverrideAuthority = none | ✅ HOLDS | same |
| No raw candles to LLM/OpenClaw | ✅ HOLDS | `assertIctAdvisorPacketIsCompact`; packet types have no candle arrays; `rawCandlesExcluded: true` in tests |
| No secrets logged/sent | ✅ HOLDS | `OPENCLAW_ADVISORY_TOKEN` server-side only; `secretsLogged: false` in all bridge tests |
| No backend/FastAPI creation | ✅ HOLDS | no backend dir; none required by this plan |

Known soft spots to harden (not violations): (a) `validateGoTraderHandoff.ts` does not independently re-verify all safety flags; (b) autonomous auto-apply is human-opt-in - keep default-off and add a UI confirmation; (c) OpenClaw stub showing as "complete" could mislead a user into trusting placeholder advice (B3).

---

## 10. Prioritized Implementation Phases

Each phase is independently shippable, ends green on build + smoke + safety tests, and changes no safety behavior.

**Phase 0 - Hygiene (small, immediate)**
1. Gitignore `.gotrader/` artifact dirs (B12).
2. Sync smoke route lists; add `/research`, `/advisory-agents`, `/agents`, `/prompt-lab` (B8).
3. Make `/research-advisor` a `<Navigate>` redirect to `/advisor`; update dashboard deep links.
4. Fix `BacktestLab` double `runBacktest` (B4); gate dashboard render counter behind a dev flag.
5. Refresh ARCHITECTURE.md route/component table (B13).

**Phase 1 - Performance and stability**
1. Extract countdown into `RefreshCountdownChip` with local interval (B2).
2. `React.lazy` all routes; vendor manualChunks for lightweight-charts/recharts (B14).
3. Shared snapshot provider: one `resolveResearchRuntimeSnapshot` cache + revision events; views subscribe instead of independently hydrating (kills duplicate IndexedDB hydration).
4. Debounce `storage`/custom-event fan-out in MissionControlShell; move `loadMt5ReadOnlySettings()` out of render (B9).
5. (Stretch) Web worker for regime + Grinch analysis heavy path.

**Phase 2 - Source consistency (trust)**
1. ICT Lab: block analysis on fallback/mock when MT5 selected, require explicit opt-in, add hard source banner (B1).
2. Global top source bar: single symbol/TF/HTF control writing the existing MT5 settings; remove duplicate pickers from Dashboard; Market Data keeps the full connection stepper.
3. Shared `SourceBadge` + `mt5CfdProxyWarning()` everywhere (replace hand-written proxy copy in ICT Lab/Replay/Walk-Forward).
4. Surface `fallbackReason`/`chartDisplayWarning` consistently (B6); remove silent mock catch in `runResearchCycle` in favor of an explicit failed-step status (B7).

**Phase 3 - Workflow chain completion**
1. Recognition card: actionable "Run Replay Review" CTA (and deep link target for the replay panel).
2. Pass `replayReview.replayResults` into hypothesis validation (B5).
3. Hypothesis queue UI in Advisor (list, manual queue, status, validate).
4. Walk-forward run <-> hypothesis linkage (attach hypothesis ID; show result back on the hypothesis).
5. Propagate validation outcomes into evidence ledger + maturity inputs (research-only fields; no readiness override).
6. "Run Research Cycle" CTA in Advisor after successful Activate Market.
7. Dedicated Paper-Demo Candidate page from `buildPaperDemoChecklist`; remove the duplicate table from Dashboard Advanced.

**Phase 4 - Advisor and OpenClaw clarity**
1. Advisor workspace tabs (Overview / Hypotheses / Signals / Deep Research / External Advisory); split `ResearchAdvisorView` into per-tab components.
2. Chat provider selector (Local / LLM bridge / OpenClaw) with explicit provider labeling on every reply.
3. Read bridge `/health`; show stub / routed / offline distinctly; stub responses badged "stub - not real advice" (B3).
4. Pilot status chips per `docs/openclaw-pilot-phased-plan.md` (`disabled` / `advisory_only` / `memory_dry_run` / `proposal_intent_draft`); add `test:openclaw-pilot-dry-run` script.
5. "Create draft proposal from advisory intent" button (manual, review-gated - no auto-apply).

**Phase 5 - App shell and IA redesign**
1. New shell: top source bar, right context panel, footer safety strip; sidebar 26 -> 8 with hub pages (Validate / Evidence / Automate / Agents) and legacy-route redirects.
2. Dashboard slimming per section 7.1; delete or re-home orphaned dashboard components.
3. Split `MissionControlShell` into Operate / Supervise / Evidence subcomponents.

**Phase 6 - Visual polish and empty states**
1. Migrate cockpit-style panels onto shared UI primitives; one typography/spacing scale.
2. EmptyState component with next-step CTA on every page (worst first: ICT Lab, Results, Market Data).
3. ICT Lab phase tabs; Validate-hub wizard flows; Settings slimming.
4. Harden `validateGoTraderHandoff` to independently verify all safety flags.

---

## 11. Tests Run and Results (2026-06-11)

| Command | Result | Notes |
|---|---|---|
| `npm.cmd run build` | ✅ PASS | tsc + vite, 31.4s. Warning: single 3,035 kB chunk (790 kB gzip) |
| `npm.cmd run smoke:routes` | ✅ PASS | 30/30 Playwright tests, 1.3m (routes, SPA nav, safety-label checks, chart fallbacks) |
| `npm.cmd run test` (ict-strategy-suite) | ✅ PASS | 10 signals, best decision `no_trade`, authority none/none/none |
| `npm.cmd run test:mt5-readonly` | ✅ PASS | Live upstream connected; real symbol list returned via `/api/v1/market/symbols` |
| `npm.cmd run test:mt5-readonly-safety` | ✅ PASS | Mutation/account/order/position endpoints rejected; GET/OPTIONS only |
| `npm.cmd run test:openclaw-advisory` | ⚪ NOT_CONFIGURED | `OPENCLAW_ADVISORY_URL` unset - classified as not_configured per policy, exit 0 |
| `npm.cmd run test:openclaw-phone-bridge` | ✅ PASS | Compact packet keys verified; `mt5Called: false`, `secretsLogged: false` |
| `npm.cmd run test:openclaw-skill-server` | ✅ PASS | Execution request refused with advisory-only response |
| `npm.cmd run test:openclaw-pilot-dry-run` | ⚪ NOT AVAILABLE | Script does not exist in package.json (flagged in Phase 4) |
| `npm.cmd run test:ict-universal-recognition` | ✅ PASS | All 6 tiers + scalp status + hypothesis queue; `rawCandlesExcluded: true` |
| `npm.cmd run test:auto-research-candidate` | ✅ PASS | ~46s; research-only guardrails asserted; auto-apply disabled |
| `git diff --check` | ✅ CLEAN | No whitespace errors |

No app failures. The only non-green items are environment/configuration states (OpenClaw URL unset, pilot dry-run script not yet created).

---

## 12. Exact Next Implementation Prompt

```
Working directory: C:/Users/andre/OneDrive/Documents/gotrader

Read first:
- docs/gotrader-completion-audit-and-ui-redesign-plan.md (this plan)
- AGENT-CONTEXT.md
- src/App.tsx, src/components/AppShell.tsx

Task: Implement Phase 0 (Hygiene) and Phase 1 (Performance and stability) from the
audit plan, exactly as scoped in section 10. Do not start Phases 2-6.

Phase 0:
1. Add `.gotrader/` to .gitignore (keep existing finer-grained entries; the goal is
   no untracked artifact noise in git status).
2. Sync tests/smoke/routes.spec.ts and scripts/smoke-routes.mjs to the same route
   list, adding /research, /advisory-agents, /agents, /prompt-lab, /advisor, and
   /research-advisor to both.
3. Change the /research-advisor route in src/App.tsx to <Navigate to="/advisor" replace />
   and update all in-app links that point to /research-advisor
   (MissionControlShell.tsx ~line 2008, IctAdvisorSummaryPanel.tsx ~line 512) to /advisor.
4. Fix the duplicate runBacktest on BacktestLab mount (useState initializer at ~185
   plus refresh effect at ~322 - run once).
5. Gate the dashboard render counter / performance marks behind import.meta.env.DEV.
6. Update the stale route/component table in ARCHITECTURE.md section 4 to match
   src/App.tsx.

Phase 1:
1. Extract the 1-second countdown in MissionControlShell.tsx (~1638) into a small
   RefreshCountdownChip component holding its own interval state so the shell stops
   re-rendering every second.
2. Convert all routes in src/App.tsx to React.lazy + a single Suspense fallback;
   add manualChunks in vite.config.ts separating lightweight-charts and recharts.
3. Create a shared runtime snapshot store (src/lib/runtime/runtimeSnapshotStore.ts):
   one resolveResearchRuntimeSnapshot call cached with a revision counter, invalidated
   by the existing update events; refactor MissionControlShell, ResearchAdvisorView,
   BacktestLab, WalkForwardView, SettingsView, and PerformanceView to subscribe to it
   instead of resolving independently.
4. Debounce the storage/custom-event refresh fan-out in MissionControlShell (~1503-1533)
   to at most one snapshot resolve per 250ms; move loadMt5ReadOnlySettings() (~719)
   out of the render path into state.

Hard safety boundaries (unchanged, enforced):
no broker execution, no live trading, no order placement, no MT5 mutation, no
readiness override, no auto-apply changes, executionAuthority/brokerAuthority/
readinessOverrideAuthority remain none, no raw candles to LLM/OpenClaw, no secrets
logged, no backend creation.

After implementation run:
- npm.cmd run build
- npm.cmd run smoke:routes
- npm.cmd run test
- npm.cmd run test:mt5-readonly-safety
- npm.cmd run test:ict-universal-recognition
- git diff --check
All must pass (treat OpenClaw not_configured as acceptable). Then commit with message
"Phase 0+1: hygiene, route sync, dashboard render and bundle performance". Do not push.
```
