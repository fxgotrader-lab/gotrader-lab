# GoTrader AI Lab Deployment Architecture

## Executive Summary

GoTrader AI Lab should deploy in phases. Vercel hosts the frontend UI. Supabase stores durable research state and uploaded historical data. Server-side functions hold secrets and call external providers. Browser code remains research/simulation only.

Broker execution remains disabled.

AI Lab remains the source of truth for:

- research cycles
- runtime snapshots
- canonical metrics
- evidence quality
- research maturity
- walk-forward validation
- self-improvement proposals
- readiness gates
- safety locks

Vercel and Supabase improve durability and collaboration, but they do not grant trading authority.

## Target Architecture

```text
Browser / Vercel Frontend
  Mission Control, charts, dashboards, read-only controls
    |
    | authenticated requests
    v
Supabase
  Auth, Postgres, RLS, Storage, realtime-safe research state
    |
    | server-side calls only
    v
Edge / Server Functions
  GPT/LLM provider, future market-data providers, webhook receivers
    |
    | advisory-only bridges
    v
OpenClaw / Hermes / Paperclip
  memory, notifications, task orchestration

go-trader / Tradovate
  locked future boundary, no browser execution
```

## Vercel Responsibilities

Vercel should host:

- React frontend
- static assets
- client-side routes
- public UI configuration
- read-only display surfaces
- authentication handoff to Supabase

Vercel should not host:

- broker credentials
- OpenAI/GPT API keys in client bundles
- Tradovate credentials
- service-role Supabase keys in browser code
- order execution logic
- readiness override logic

Vercel serverless or edge functions may later host provider calls if they preserve the same authority model.

## Supabase Responsibilities

Supabase should provide:

- Auth
- workspace/user membership
- durable Postgres persistence
- row-level security
- audit logs
- Storage for uploaded market-data files
- compact research artifacts
- optional realtime updates for mission-control status

Supabase should not make readiness decisions. It stores AI Lab decisions and evidence; it does not replace the AI Lab research logic.

## Server-Side Provider Boundary

All secret-bearing provider calls must run server-side:

- GPT/LLM calls
- future market-data API calls
- future OpenClaw/Hermes bridges
- future Paperclip task bridge
- future Tradovate demo bridge

Frontend code can request a server action, but the server must validate:

- user/workspace access
- task type
- authority fields
- budget/cost limits
- webhook signatures
- readiness/safety state where relevant

## Future Integrations

### GPT / LLM Provider

Move the local LLM bridge into a server-side provider when ready. Browser code should never contain GPT API keys. LLM responses remain advisory-only and must still pass the existing schema validation.

### Market Data Provider

Future real market-data APIs should plug into the market-data adapter boundary. Imported historical data remains supported through Supabase Storage. Live websocket feeds stay out of scope until a later explicit phase.

### OpenClaw / Hermes

OpenClaw remains advisory memory/review only. Hermes remains notification-only. Server-side bridge functions may forward compact AI Lab events after validating that every payload has:

- execution authority: none
- broker authority: none
- readiness override authority: none

### Paperclip

Paperclip remains planning/evaluation only until a separate implementation phase. It may eventually read AI Lab status summaries, create work tickets, track budgets, and store research work products. It must not approve readiness, trigger broker actions, or send go-trader handoffs.

### go-trader / Tradovate

go-trader and Tradovate remain locked until readiness, maturity, walk-forward, evidence, and simulation runbook gates pass under a future human-reviewed bridge design. No browser route should execute orders.

## Security Rules

Required:

- no API keys in frontend
- no broker execution from browser
- no Tradovate credentials in browser
- Supabase RLS on every user/workspace table
- audit trails for mutations
- service-role key server-side only
- webhook signatures required
- least-privilege Edge Function scopes
- compact storage of research summaries
- immutable source/run fingerprints for metrics
- explicit safety authority fields on integration packets

Rejected by default:

- readiness overrides
- broker setting mutations
- live/demo execution toggles
- go-trader handoff approvals
- external tool requests that imply trading authority

## Deployment Phases

### Phase 0: Local-First

Current state. Browser localStorage and local imports are used for research. No deployment authority exists.

### Phase 1: Vercel Frontend

Deploy UI only. Keep local-first behavior where possible. No server secrets. No provider keys.

### Phase 2: Supabase Persistence

Add Auth, workspace tables, Postgres persistence, and Storage for uploaded market-data files. RLS is mandatory before storing user data.

### Phase 3: Server-Side LLM Provider

Move GPT/LLM calls into Edge/server functions. Keep advisory-only response validation.

### Phase 4: Market-Data API Provider

Add server-side market-data adapters. Keep imported historical data and provider metadata traceable in runtime snapshots.

### Phase 5: OpenClaw/Hermes/Paperclip Orchestration

Add advisory memory, notifications, and task orchestration bridges. Keep AI Lab source-of-truth ownership.

### Phase 6: Paper-Demo Bridge Later

Only after readiness, maturity, evidence, walk-forward, and simulation runbook gates pass repeatedly. Requires a separate explicit implementation and safety review.

## Final Boundary

Vercel hosts the UI. Supabase stores durable research state. Server functions hold secrets. AI Lab remains the research/readiness authority. go-trader/Tradovate remain locked. Broker execution remains disabled.

