# Vercel Deployment Plan

## Purpose

This plan describes how GoTrader AI Lab can be deployed to Vercel without changing the research/simulation authority model.

Broker execution remains disabled.

## What Vercel Hosts

Vercel should host:

- React app shell
- Mission Control Dashboard
- charting UI
- route-level pages
- static documentation links
- client-side Supabase Auth integration
- read-only display of runtime state

Vercel should not host browser-exposed secrets or trading authority.

## Frontend Environment Variables

Allowed public variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- feature flags that do not contain secrets
- public app metadata

Forbidden frontend variables:

- OpenAI/GPT API key
- Supabase service-role key
- Tradovate credentials
- broker API keys
- OpenClaw/Hermes secrets
- Paperclip secrets
- webhook signing secrets

## Server-Side Functions

Use Vercel serverless functions, Edge Functions, or Supabase Edge Functions for secret-bearing work.

Server-side responsibilities:

- GPT/LLM provider calls
- future market-data provider calls
- future OpenClaw/Hermes bridge calls
- future Paperclip task bridge calls
- webhook verification
- report generation jobs if they require secrets

Every server function must validate:

- authenticated user
- workspace access
- task type
- authority fields
- request size
- budget/cost limits
- webhook signature when inbound from an external tool

## Build and Deploy

Suggested Vercel setup:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

Do not deploy until environment variables are reviewed and the app is confirmed to run without local-only assumptions.

## Routing

The app is a client-side routed React application. Vercel should rewrite all application routes to `index.html`.

Routes include:

- `/dashboard`
- `/market-data`
- `/autonomous-research`
- `/walk-forward`
- `/self-improvement`
- `/readiness-gate`
- `/performance`
- `/communications`
- `/settings`
- advanced lab routes

## Supabase Auth

Vercel frontend should use Supabase Auth for login/session management once persistence is enabled. The frontend should use only the Supabase anon key. RLS must protect every table.

## Uploaded Market Data

Historical data uploads should move from browser-only storage to Supabase Storage in a later phase.

Frontend responsibilities:

- choose file
- show validation status
- request upload path
- display metadata

Server/Supabase responsibilities:

- store raw file
- validate workspace access
- persist metadata
- avoid storing giant candle arrays in normal research rows

## LLM Provider Boundary

The current local bridge is useful for development. In deployed mode, GPT/LLM calls should go through a server-side provider.

Rules:

- no GPT API key in the browser
- responses remain advisory-only
- unsafe responses are rejected
- required reviewer schema remains enforced
- LLM runs are stored compactly

## Market Data Provider Boundary

Future market-data provider calls should be server-side.

Allowed later:

- candles
- macro calendar
- VIX/DXY/yields
- intermarket summaries
- COT/gamma imports

Still locked:

- live websocket feeds
- broker execution feeds
- Tradovate trading connection

## OpenClaw, Hermes, and Paperclip

Vercel or Supabase functions may later provide bridge endpoints for:

- OpenClaw advisory memory
- Hermes notifications
- Paperclip task orchestration

All bridge packets must preserve:

- execution authority: none
- broker authority: none
- readiness override authority: none

OpenClaw and Hermes remain advisory/notification only. Paperclip remains planning/evaluation and task orchestration only.

## Tradovate and go-trader Boundary

No Tradovate provider should be deployed in this phase.

Future Tradovate demo integration requires:

- repeated Paper-Demo Candidate readiness
- sufficient research maturity
- passing walk-forward validation
- acceptable evidence quality
- simulation runbook completion
- human-reviewed bridge design
- server-side credentials
- separate safety audit

Vercel UI must not contain order buttons or broker execution controls.

## Security Checklist

Before Vercel deployment:

- confirm no secrets in frontend env
- confirm no broker execution routes
- confirm no order placement UI
- confirm no readiness override controls
- confirm Supabase RLS if persistence is enabled
- confirm server-side functions validate workspace access
- confirm webhook signatures for external integrations
- confirm audit trails for mutations
- confirm service-role keys are server-only

## Deployment Phases

### Phase 1: Static UI

Deploy the existing UI only. Keep local-first behavior. No Supabase writes required.

### Phase 2: Auth and Persistence

Add Supabase Auth and workspace persistence. Keep local fallback while migration is validated.

### Phase 3: Server-Side LLM

Move LLM provider calls server-side. Store compact advisory runs.

### Phase 4: Market Data

Add server-side market-data adapters and Supabase Storage-backed historical imports.

### Phase 5: Orchestration Bridges

Add OpenClaw/Hermes/Paperclip bridges after authority validation is stable.

### Phase 6: Paper-Demo Bridge Later

Separate future implementation. Not part of Vercel frontend deployment.

## Final Warning

Vercel deployment is UI hosting and serverless support only. It does not grant broker execution, demo/live trading, Tradovate access, readiness override, or order authority.

