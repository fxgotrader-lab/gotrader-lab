# Paperclip Use Case Audit

## 1. Executive Recommendation

Paperclip should be planned, not integrated live yet.

The best role for Paperclip is an external agent operations and governance control plane above GoTrader AI Lab. It should coordinate research-only tasks, schedules, budgets, work products, and review tickets for OpenClaw, Hermes, Codex, and future agents. It should not own trading logic, readiness decisions, strategy metrics, broker state, or any execution path.

GoTrader AI Lab should remain the source of truth for market research, runtime snapshots, evidence quality, research maturity, walk-forward results, self-improvement proposals, readiness gates, and safety locks. Paperclip can ask for summaries or request work, but it must not decide that the system is ready, approve proposals, or send go-trader or broker handoffs.

Recommended status: plan now, add only a Settings visibility card, defer live integration until the AI Lab runtime API, Supabase/Vercel deployment model, and governance contracts are stable.

Source reviewed: [paperclipai/paperclip](https://github.com/paperclipai/paperclip). Paperclip presents itself as open-source orchestration for teams of AI agents with org charts, work/task management, heartbeats, budgets, governance, approvals, routines/schedules, secrets/storage, activity logs, plugins, and work products. It explicitly describes itself as a control plane rather than an agent reasoning framework.

## 2. Best-Fit Architecture

Best fit:

```text
Paperclip
  Agent operations, task tickets, schedules, budgets, governance, work products
    |
    | research-only requests and status summaries
    v
GoTrader AI Lab
  Mission Control, ResearchRuntimeSnapshot, readiness, metrics, proposals, safety
    |
    | advisory memory / notifications
    v
OpenClaw / Hermes
  advisory review, memory notes, notification routing
    |
    | future review-only handoff after all AI Lab gates pass
    v
go-trader
  execution system, separate and locked behind human review
```

Paperclip should sit above AI Lab, but only as an operations layer. It should manage work around the research system, not the research truth inside the system.

The clean boundary is:

- Paperclip owns who should work on what, when, with what budget, and what work product should be produced.
- AI Lab owns whether the research is valid, ready, mature, or blocked.
- OpenClaw/Hermes own advisory memory and notifications.
- go-trader owns future execution mechanics only after separate review gates.

## 3. What Paperclip Should Own

Paperclip is a good fit for:

- Scheduling research-only routines.
- Creating work tickets for Codex/OpenClaw/Hermes.
- Tracking pre-market and post-market research tasks.
- Tracking daily or weekly research reports as work products.
- Tracking agent heartbeats and stale work.
- Managing GPT/OpenClaw/Codex budget ceilings.
- Organizing research work by goals, projects, and agents.
- Creating review tickets when AI Lab reports a blocker.
- Storing generated research reports, failure analyses, and strategy summaries.
- Auditing which agent produced which work product and when.
- Coordinating Codex implementation tasks after a human approves a technical plan.

Paperclip should be allowed to ask AI Lab for read-only summaries:

- latest runtime status
- latest readiness state
- active blockers
- latest walk-forward result
- latest evidence quality summary
- latest research maturity summary
- latest proposal summary
- latest autonomous loop status
- latest report/work-product references

## 4. What AI Lab Should Own

AI Lab must remain the source of truth for:

- ResearchRuntimeSnapshot.
- Market data source state.
- Active calibration and config resolution.
- Backtest and validation summaries.
- Auto Research candidate selection.
- Walk-forward validation.
- Evidence Quality Score.
- Research Maturity Score.
- Self-Improvement proposals and approval state.
- Readiness Gate state.
- Mission Control pipeline state.
- Simulation runbook state.
- Safety lock state.
- Whether go-trader review is eligible.

Paperclip can coordinate and record work about these things, but it must not become the authority for them.

## 5. What OpenClaw/Hermes Should Own

OpenClaw should remain advisory memory and review:

- failure analysis memory
- scenario recommendation
- proposal review
- calibration drift notes
- post-cycle summaries

Hermes should remain notification routing:

- loop started
- cycle completed
- walk-forward failed or insufficient
- action required
- maturity changed
- readiness changed

Paperclip can manage tickets that request OpenClaw or Hermes work. It should not replace AI Lab's OpenClaw/Hermes authority model.

## 6. What go-trader Should Own

go-trader should remain separate from Paperclip and AI Lab research orchestration.

Future go-trader ownership:

- paper/demo/live execution mechanics
- broker connectivity
- order placement
- scheduler/executor behavior
- broker account and position state

AI Lab may eventually produce a human-reviewed go-trader handoff when all readiness gates pass. Paperclip must not send that handoff, approve it, or bypass the AI Lab gate.

## 7. Allowed Task Types

Paperclip may eventually request:

- `request_ai_lab_status_summary`
- `schedule_pre_market_research`
- `schedule_post_market_research`
- `create_research_review_ticket`
- `request_openclaw_failure_analysis`
- `request_openclaw_proposal_review`
- `request_hermes_notification`
- `request_codex_implementation_plan`
- `request_codex_bug_fix_task`
- `generate_research_report`
- `generate_walk_forward_report`
- `generate_readiness_report`
- `archive_work_product`
- `track_budget_usage`
- `pause_noncritical_agent_work`
- `log_agent_heartbeat`

Allowed requests should be idempotent where possible and should include:

- request id
- Paperclip issue id
- AI Lab runtime fingerprint
- source route
- requested output type
- authority block
- expiration time
- budget/cost ceiling
- human reviewer when approval is needed

## 8. Forbidden Task Types

Paperclip must never be allowed to:

- place trades
- approve Paper-Demo Candidate
- override readiness
- send go-trader handoff
- connect Tradovate
- modify broker settings
- change API keys
- disable safety locks
- approve live/demo execution
- change max daily loss
- change contract sizing
- alter broker risk settings
- approve its own work product as trading-ready
- mutate AI Lab active calibration directly
- mark walk-forward as passed
- mark evidence quality as sufficient
- mark research maturity as sufficient
- suppress blockers or warnings

Any Paperclip request containing these intents should be rejected and logged.

## 9. Minimal Viable Integration

Safest minimal integration later:

1. Keep Paperclip external.
2. Add an AI Lab read-only status endpoint or export packet.
3. Add a signed or local-only request schema for research-only task requests.
4. Add a Paperclip status card in Settings and Mission Control.
5. Allow Paperclip to create task tickets from AI Lab blockers.
6. Allow AI Lab to export work-product summaries for Paperclip storage.
7. Keep all requests advisory and require AI Lab to validate the authority block.
8. Do not add webhooks that mutate calibration, readiness, or handoff state.

Minimal request examples:

- "Create a Codex task to investigate why walk-forward is insufficient."
- "Ask OpenClaw to review the latest failure diagnosis."
- "Generate a post-market research report from the latest runtime snapshot."
- "Schedule tomorrow morning's pre-market research summary."

The minimal integration should not trigger autonomous loops automatically until the scheduler policy is designed and tested.

Current planning artifacts in AI Lab:

- `src/lib/integrations/paperclipTypes.ts` defines the planning-only Paperclip contract shape.
- `src/lib/integrations/paperclipAuthorityPolicy.ts` defines allowed future uses, forbidden uses, and authority-none safety rules.
- Settings shows a "Paperclip Agent Operations" card with planned/evaluation status.
- Mission Control advanced details show the same planned authority boundary.
- No Paperclip package is installed.
- No Paperclip webhook, credential, API call, or live integration exists.

## 10. Full Future Integration

A fuller future integration could include:

- Paperclip company/org model for GoTrader research operations.
- AI Lab registered as a project/workspace.
- Codex, OpenClaw, Hermes, and report agents listed as Paperclip workers.
- Paperclip routines for pre-market, midday, post-market, and weekly review.
- Work products for research reports, failure analyses, strategy summaries, and release notes.
- Budget controls by agent and task type.
- Paperclip activity logs mirroring AI Lab communications events.
- AI Lab runtime snapshots linked to Paperclip tasks.
- Supabase-backed shared storage for reports and task metadata.
- Vercel-hosted AI Lab read-only API for Paperclip status polling.
- Local bridge for private tasks that should not leave the user's machine.

Even in a full integration, Paperclip should remain task orchestration only. It should not take custody of trading authority.

## 11. Security and Safety Model

Required safety model:

- All Paperclip inbound packets must include `executionAuthority: none`.
- All packets must include `brokerAuthority: none`.
- All packets must include `readinessOverrideAuthority: none`.
- AI Lab validates authority fields before processing.
- AI Lab rejects unknown or privileged task types.
- AI Lab treats Paperclip tasks as requests, not commands.
- AI Lab never exposes API keys to Paperclip from the frontend.
- AI Lab never exposes broker credentials to Paperclip.
- Mutating requests require human review unless explicitly classified as safe local research bookkeeping.
- AI Lab logs accepted, rejected, and ignored Paperclip requests.
- Paperclip work products should reference runtime fingerprints so reports remain traceable.

For Supabase/Vercel later:

- public frontend remains API-key free except normal public Supabase anon keys if used
- privileged task processing runs server-side
- service role keys stay off the client
- webhook signatures are required
- CORS is restricted
- row-level security separates user/workspace data
- live trading routes do not exist in AI Lab

## 12. Risks and Failure Modes

Key risks:

- Authority creep: Paperclip starts as task tracking but slowly gains control over readiness or calibration.
- Duplicate truth: Paperclip task state diverges from AI Lab runtime state.
- Stale reports: Paperclip stores a report from an old runtime fingerprint and presents it as current.
- Cost loops: scheduled agent work runs too often without budget hard stops.
- Hidden mutation: a "research task" indirectly changes active calibration.
- Over-automation: pre-market routines trigger autonomous loops before data quality and evidence checks are sufficient.
- Security leakage: future secrets/storage integration tempts API-key movement into the frontend.
- Human-review bypass: Paperclip governance is mistaken for AI Lab readiness approval.

Mitigations:

- keep AI Lab source-of-truth ownership
- require runtime fingerprints on every report
- implement allowlisted task types only
- reject any request with execution or readiness authority
- mirror Paperclip requests into AI Lab communications/audit
- start with read-only summaries and report storage
- use budget ceilings and task expiration
- require explicit human review for any calibration or deployment request

## 13. Recommended Implementation Phases

### Phase 0: Planning Only

Status: do now.

- Add this audit document.
- Add a Settings card showing Paperclip as evaluation/planned.
- Do not install Paperclip.
- Do not create credentials.
- Do not add webhooks.

### Phase 1: Read-Only Export Contract

- Define `PaperclipStatusSummary`.
- Export runtime fingerprint, readiness, evidence, maturity, proposal, and walk-forward summaries.
- Add local file export or internal API shape.
- Add no inbound Paperclip mutation path.

### Phase 2: Work Product Export

- Generate research reports from AI Lab.
- Store report metadata locally.
- Optionally allow Paperclip to ingest reports manually or through a local bridge.
- Link reports back to runtime fingerprints.

### Phase 3: Task Request Inbox

- Add an AI Lab Paperclip request inbox.
- Support only allowlisted task requests.
- Show requests in Communications and Mission Control.
- Require user approval before Codex/OpenClaw work begins.

### Phase 4: Scheduled Research Routines

- Allow Paperclip to schedule pre-market/post-market research report requests.
- Keep autonomous loop triggering disabled by default.
- Add budget and cooldown gates.
- Add stale-data and evidence-quality checks before any routine runs.

### Phase 5: Controlled Autonomous Loop Trigger

- Allow Paperclip to request an autonomous research loop only if:
  - AI Lab safe mode is active
  - loop max iterations are bounded
  - data source is available
  - evidence quality is not critically weak
  - user enabled Paperclip-triggered loops
  - request includes authority none

Paperclip still cannot approve the result.

### Phase 6: Supabase/Vercel Integration

- Store work products and task references in Supabase.
- Host read-only status APIs server-side.
- Add webhook signature validation.
- Keep service-role keys server-only.
- Preserve AI Lab readiness and safety authority.

## 14. Final Recommendation

Plan only now.

Paperclip is a strong architectural fit as an external agent operations/control plane for GoTrader AI Lab, especially for task orchestration, scheduling, work products, heartbeats, budgets, and governance. It should manage OpenClaw/Hermes/Codex work around the trading research system rather than manage trading logic inside it.

Do not integrate live Paperclip yet. The safest next step is to keep the Settings planning card, preserve this audit, and later add a read-only Paperclip status/export contract after the runtime snapshot and deployment model are stable.
