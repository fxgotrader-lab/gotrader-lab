# OpenClaw Pilot Phased Plan

Last updated: 2026-06-11

## Purpose

This document converts the PILOT OpenClaw vision into a safe, phased GoTrader-native implementation plan. The PILOT ideas are treated as research orchestration guidance, not direct implementation instructions.

GoTrader remains a TypeScript/Vite/React research workbench with local Node scripts and browser storage. The current repo does not contain a Python/FastAPI backend, and this plan does not create one. OpenClaw remains an optional advisory, memory, reflection, and proposal-intent layer around GoTrader's deterministic MT5-first research stack.

## PILOT Source Note

No `PILOT.docx` or pasted full PILOT body was found in the accessible workspace or Codex attachment search during this pass. This plan is based on the PILOT assessment included in the task request and on the current GoTrader code/docs listed below.

Code and docs reviewed for fit:

- `AGENT-CONTEXT.md`
- `ARCHITECTURE.md`
- `package.json`
- `src/lib/autonomousResearch/*`
- `src/lib/researchCycle/*`
- `src/lib/selfImprovement/*`
- `src/lib/researchMemory/*`
- `src/lib/llm/*`
- `docs/openclaw-gotrader-advisory.md`
- `docs/openclaw-phone-gotrader-advisory.md`
- `docs/openclaw-gotrader-research-advisor-skill.md`
- `docs/openclaw-phone-bridge-runbook.md`
- `docs/gbrain-gotrader-research-memory.md`

## Accepted PILOT Ideas

The following ideas fit GoTrader when bounded by existing safety gates:

- `program.md` style human-editable instructions for OpenClaw's research pilot behavior.
- OpenClaw as a research pilot that reviews compact GoTrader outputs.
- Audit entries for advisory reviews, proposal intents, memory writes, and validation decisions.
- Memory packets that summarize cycles, blockers, walk-forward outcomes, and proposal history.
- Reflection summaries describing what worked, what failed, and what to test next.
- Trade-analysis style review, renamed research setup analysis, using simulated/replay outcomes only.
- Proposal lifecycle with draft, queued, validation, rejected, or ready-for-human-review states.
- GPT/OpenClaw review as advisory-only explanation and calibration guidance.
- Walk-forward before proposal progression.
- Strict forbidden fields for raw candles, secrets, account, order, position, and broker mutation data.

## Rejected Or Deferred PILOT Ideas

The following ideas are not safe to implement directly:

- Creating `backend/openclaw` or Python/FastAPI files without an existing backend architecture or explicit approval.
- Giving OpenClaw direct authority over calibration application.
- Implementing `applyCalibration` as an OpenClaw action.
- Allowing OpenClaw to write `active_calibration` or mutate `gotrader_ai_lab_active_research_calibration`.
- Allowing OpenClaw to bypass GoTrader readiness, evidence, maturity, walk-forward, or Paper-Demo Candidate gates.
- Mixing GPT, Claude, and OpenClaw runtime responsibilities before the existing OpenClaw advisory contract is stable.
- Treating MT5 `USTECH` CFD/proxy candles as CME MNQ/NQ futures truth.
- Adding broker execution, live trading, MT5 execution, order placement, account access, position access, or readiness override.

## Authority Contract

Every phase must preserve:

```json
{
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none",
  "autoApplyAllowed": false
}
```

OpenClaw cannot approve readiness, place trades, call MT5, mutate broker state, or create an execution intent.

## Phase 0 - Current Boundary

Status: implemented/planned across existing GoTrader docs and code.

Current GoTrader roles:

- GoTrader is the deterministic research engine.
- MT5 read-only is the primary current candle source.
- MT5 wrapper blocks account, order, position, deal, buy, sell, close, modify, cancel, and non-GET mutation paths.
- ICT/Grinch research, regime, evidence, maturity, readiness, walk-forward, research committee, and Paper-Demo checklist remain GoTrader-owned.
- OpenClaw phone bridge and Research Advisor skill exist as optional advisory endpoints.
- gbrain research memory contracts exist as compact packet plans/builders.
- Execution authority, broker authority, and readiness override authority remain `none`.

Current integration seams:

- `src/lib/llm/llmTypes.ts` defines `GoTraderAdvisoryPacket` and `OpenClawAdvisoryResponse`.
- `src/lib/llm/advisoryProviderClient.ts` sends OpenClaw advisory packets and normalizes unsafe authority back to safe advisory output.
- `src/lib/researchMemory/*` builds compact research-memory packets with explicit exclusions.
- `src/lib/selfImprovement/*` owns calibration proposal state and active research calibration storage.
- `src/lib/autonomousResearch/*` owns research-loop policy and default-disabled auto-apply.

Phase 0 rule: OpenClaw can explain and advise only.

## Phase 1 - Program File

Goal: add a human-editable OpenClaw pilot instruction file without giving OpenClaw mutation authority.

Recommended artifact:

```text
docs/openclaw/program.md
```

The program file should define:

- pilot name and version
- current GoTrader source model
- hard constraints
- optimization priorities
- allowed proposal families
- forbidden fields
- required validation gates
- authority contract
- escalation language for uncertain cases

OpenClaw may read this file as advisory instructions. OpenClaw must not edit it. Changes to the program file should be reviewed in git like any other GoTrader source artifact.

Allowed proposal families should remain research-only examples, such as:

- `model_1_timing_recheck`
- `reversal_expansion_confirmation`
- `consolidation_range_tightness`
- `liquidity_raid_detection`
- `timing_window_sensitivity`
- `pd_array_alignment_review`
- `cmd_paper_watchlist_tracking_review`
- `ict_hypothesis_validation`

Forbidden fields:

- `executionAuthority`
- `brokerAuthority`
- `readinessOverrideAuthority`
- `autoApplyAllowed: true`
- broker/API credentials
- account/order/position state
- MT5 execution requests
- live/demo mode toggles
- active calibration storage mutation
- raw candles
- screenshots/base64

Phase 1 output: program instructions only.

## Phase 2 - OpenClaw Memory And Audit Packets

Goal: let GoTrader create compact, safe memory/audit packets for OpenClaw and future gbrain use.

Use existing research-memory contracts first:

- `GoTraderResearchCycleMemory`
- `GoTraderWalkForwardMemory`
- `GoTraderSelfImprovementMemory`
- `GoTraderGapAnalysisMemory`
- `GoTraderAgentMetricMemory`

Add OpenClaw pilot memory/audit envelopes only as wrappers around compact summaries. Do not duplicate candle arrays or runtime snapshots.

Audit entry examples:

- `program_loaded`
- `advisory_packet_sent`
- `advisory_response_received`
- `unsafe_response_rejected`
- `proposal_intent_created`
- `proposal_intent_rejected`
- `memory_packet_created`
- `validation_required`

Memory entries may include:

- cycle id
- source provider
- requested symbol
- broker symbol
- source fingerprint
- candle count
- regime summary
- ICT/Grinch summary
- blockers
- evidence/maturity/readiness summary
- walk-forward verdict
- proposal intent id
- next action

Memory/audit entries must exclude:

- candle arrays
- raw runtime snapshots
- secrets
- MT5 credentials
- account/order/position data
- screenshots/base64
- imported OHLCV arrays

Phase 2 output: compact packet creation and optional offline queue only. A gbrain connector remains optional and disabled by default.

## Phase 3 - OpenClaw Proposal Intent

Goal: allow OpenClaw to suggest draft proposal intent while GoTrader keeps all validation and mutation authority.

OpenClaw may return a draft intent shaped like:

```json
{
  "createProposal": true,
  "proposalTitle": "Review CMD paper-watchlist alignment",
  "targetSubsystem": "ICT Strategy Suite",
  "candidateFamilies": ["ict_hypothesis_validation"],
  "requiresWalkForward": true,
  "autoApplyAllowed": false
}
```

GoTrader should validate the intent before displaying or converting it:

- authority fields must be `none`
- `autoApplyAllowed` must be `false`
- candidate family must be known or marked planned
- intent must not request direct threshold mutation
- intent must not reference broker/account/order/position fields
- intent must require deterministic validation

OpenClaw must not:

- call `applyCalibration`
- call `approveCalibrationProposal`
- write `ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY`
- write `SELF_IMPROVEMENT_STORAGE_KEY`
- set proposal status to accepted
- mark Paper-Demo Candidate

Phase 3 output: draft proposal intent only.

## Phase 4 - Validation Pipeline

Goal: define the deterministic GoTrader gates that any OpenClaw proposal intent must pass before it can move forward.

Required validation path:

1. AI Research Cycle
2. Backtest
3. Replay snapshot
4. Walk-forward
5. Evidence quality check
6. Maturity check
7. Readiness gate
8. Research Committee review
9. Paper-Demo Candidate checklist
10. Safety authority check

Relevant existing GoTrader files:

- `src/lib/researchCycle/runResearchCycle.ts`
- `src/lib/backtesting/*`
- `src/components/replay/*`
- `src/lib/walkForward/*`
- `src/lib/evidence/*`
- `src/lib/maturity/*`
- `src/lib/readiness/*`
- `src/lib/researchCommittee/*`
- `src/lib/readiness/buildPaperDemoChecklist.ts`

Validation must preserve source provenance:

- MT5 read-only source remains read-only.
- Broker symbol such as `USTECH` is labeled CFD/proxy.
- Requested symbol such as `MNQ` remains separate from broker symbol.
- 90-day data is fetched only through explicit manual/CLI deep-history paths, not page load.
- Raw candles stay internal.

Phase 4 output: deterministic validation report, not automatic approval.

## Phase 5 - Self-Improvement Integration

Goal: convert a validated OpenClaw proposal intent into GoTrader's existing self-improvement draft flow without auto-apply.

Allowed flow:

```text
OpenClaw proposal intent
  -> GoTrader validates intent contract
  -> GoTrader creates draft self-improvement proposal
  -> Auto Research tests candidate family if executable
  -> Walk-forward/evidence/maturity/readiness gates score it
  -> Research Committee and Paper-Demo checklist review it
  -> Human/deterministic review decides next status
```

Statuses should remain explicit:

- draft intent
- queued for deterministic validation
- testing
- rejected
- needs more data
- ready for human review

Not allowed:

- auto-promote
- auto-apply
- active calibration mutation by OpenClaw
- readiness override
- execution request
- direct MT5 call

Phase 5 output: GoTrader-owned proposal draft with OpenClaw provenance.

## Phase 6 - Future Execution Request Model

Status: planned only; not implemented.

In a future architecture, OpenClaw may request trade evaluation only. That request would be a research object asking GoTrader to evaluate a candidate setup against risk, readiness, execution infrastructure, and operator policy.

Even in that future phase:

- OpenClaw does not call MT5.
- OpenClaw does not call brokers.
- OpenClaw does not place orders.
- OpenClaw does not inspect or mutate account/order/position data.
- OpenClaw does not approve readiness.
- GoTrader risk/execution infrastructure, if explicitly built later, remains final authority.

Until an explicit future paper/live infrastructure exists, execution remains disabled.

## Safe Implementation Sequence

Recommended next small steps:

1. Add `docs/openclaw/program.md` as a human-authored pilot instruction file.
2. Add a validator for OpenClaw proposal intent that rejects forbidden fields.
3. Add an OpenClaw pilot audit packet builder that records compact advisory/proposal events.
4. Add a dry-run command that prints what would be sent to OpenClaw without sending it.
5. Add optional gbrain write adapter behind an explicit disabled-by-default flag.
6. Add UI display for OpenClaw pilot status: `disabled`, `advisory_only`, `memory_dry_run`, `proposal_intent_draft`.

Do not implement loop execution, backend endpoints, active calibration mutation, broker execution, or auto-apply as part of the pilot.

## Acceptance Criteria

The OpenClaw pilot is safe when:

- build passes
- smoke routes pass
- MT5 read-only safety passes
- OpenClaw advisory response validation rejects unsafe authority
- no raw candles are serialized into OpenClaw, gbrain, journal, or memory packets
- no secrets are logged or sent
- proposal intents are draft-only
- `autoApplyAllowed` remains false
- all authority fields remain none
- deterministic GoTrader gates remain the only source of readiness state
