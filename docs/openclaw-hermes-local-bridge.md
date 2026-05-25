# OpenClaw / Hermes Local Bridge Contract

This document defines the local file-watch bridge contract for OpenClaw/Hermes advisory review.

It does not implement a live OpenClaw connection, Hermes execution, broker execution, live trading, Tradovate, TopStep,
API keys, websocket feeds, multi-account/copy-trading, or readiness override.

## Status

- status: local script available
- mode: local file contract
- OpenClaw connection: not connected
- Hermes connection: not connected
- file watcher: local script available
- execution authority: none
- broker authority: none
- readiness override authority: none

## File Contract

Request folder:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/`

Response folder:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/`

Processed folder:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/processed/`

Error folder:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/errors/`

Stable request file:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/latest-advisory-request.json`

Stable response file:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/latest-advisory-response.json`

## Future Lifecycle

1. AI Lab exports an advisory-only request packet.
2. The local bridge can run once or watch `advisory/requests/*.json`.
3. The current bridge generates a mock advisory response without calling a live API.
4. A future bridge may pass the request to OpenClaw/Hermes for research review only.
5. The bridge writes an advisory-only response file to `advisory/responses/latest-advisory-response.json`.
6. The bridge copies valid processed requests to `advisory/processed/`.
7. Invalid request details are written to `advisory/errors/`.
8. The user imports the response into AI Lab.
9. AI Lab validates the response authority locks before storing it locally.

## Script Commands

Run once:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --once
```

Watch mode:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --watch
```

Dry-run mode:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --once --dry-run
```

Local command mode:

```powershell
$env:GOTRADER_ADVISORY_COMMAND = "openclaw run gotrader-advisory-review"
node scripts/openclaw-hermes-advisory-bridge.mjs --once --provider local-command
```

Local command fallback mode:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --once --provider local-command --fallback-mock
```

The script prints:

```text
Advisory-only bridge. No execution authority. No broker control.
```

## Provider Modes

Default provider:

`mock`

Optional provider:

`local-command`

`local-command` uses `GOTRADER_ADVISORY_COMMAND`. The bridge passes request JSON to stdin and expects advisory response
JSON on stdout. The command must not print non-JSON text to stdout.

Required response authority locks:

- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`

If the local command fails or returns invalid JSON, the bridge writes an error file to `advisory/errors/`. Mock fallback
only runs when `--fallback-mock` is provided.

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
- hardcode OpenClaw credentials
- call broker or go-trader execution APIs

## Safety Boundary

Planning-only local file bridge contract. No live OpenClaw/Hermes connection, no execution authority, no broker control,
and no readiness override.
