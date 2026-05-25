# OpenClaw / Hermes Local Bridge Contract

This document defines a future local file-watch bridge contract for OpenClaw/Hermes advisory review.

It does not implement a live OpenClaw connection, Hermes execution, broker execution, live trading, Tradovate, TopStep,
API keys, websocket feeds, multi-account/copy-trading, or readiness override.

## Status

- status: planning only
- mode: local file contract
- OpenClaw connection: not connected
- Hermes connection: not connected
- file watcher: not implemented
- execution authority: none
- broker authority: none
- readiness override authority: none

## File Contract

Request folder:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/`

Response folder:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/`

Stable request file:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/latest-advisory-request.json`

Stable response file:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/latest-advisory-response.json`

## Future Lifecycle

1. AI Lab exports an advisory-only request packet.
2. A future local bridge may watch `advisory/requests/*.json`.
3. The bridge may pass the request to OpenClaw/Hermes for research review only.
4. OpenClaw/Hermes may return advisory feedback.
5. The bridge may write an advisory-only response file to `advisory/responses/*.json`.
6. The user imports the response into AI Lab.
7. AI Lab validates the response authority locks before storing it locally.

## Request Validation

The bridge must preserve these request rules:

- `mode` must be `advisory_only`
- `executionAuthority` must be `none`
- `brokerAuthority` must be `none`
- `readinessOverrideAuthority` must be `none`
- `packetId`, `thesisId`, `symbol`, and `timeframe` must be present

## Response Validation

The bridge must preserve these response rules:

- `mode` must be `advisory_only`
- `executionAuthority` must be `none`
- `brokerAuthority` must be `none`
- `readinessOverrideAuthority` must be `none`
- `packetId` must be present
- `proceedRecommendation` must be advisory-only

Allowed proceed recommendations:

- `continue_research`
- `rerun_validation`
- `paper_demo_candidate_review`

## Prohibited Actions

The local bridge must not:

- execute trades
- approve trades
- override readiness gates
- connect to brokers
- change live settings
- control go-trader
- write API keys or credentials

## Safety Boundary

Planning-only local file bridge contract. No live OpenClaw/Hermes connection, no execution authority, no broker control,
and no readiness override.
