# OpenClaw/Hermes Local Advisory Bridge Script

This script is a local, file-based advisory bridge for GoTrader AI Lab.

It does not call a live OpenClaw/Hermes API, connect to a broker, call go-trader execution, place orders, store secrets,
open websocket feeds, or override readiness gates.

## Commands

Run once:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --once
```

Watch for local request files:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --watch
```

Every run prints:

```text
Advisory-only bridge. No execution authority. No broker control.
```

## Workflow

1. Export an advisory request packet from AI Lab.
2. Save it as:

   `advisory/requests/latest-advisory-request.json`

3. Run the bridge once:

   `node scripts/openclaw-hermes-advisory-bridge.mjs --once`

4. The bridge writes:

   `advisory/responses/latest-advisory-response.json`

5. The bridge copies the processed request into:

   `advisory/processed/`

6. Paste the response JSON back into the `/advisory-agents` review screen.

Invalid requests are written to:

`advisory/errors/`

## Validation

Request files must keep:

- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`

The generated response keeps the same authority locks and uses:

`advisoryAgent: "openclaw_hermes_local_bridge_mock"`

## Future Upgrade Path

A future bridge may replace the mock response generator with a real local OpenClaw/Hermes connector or authenticated API
call. That future connector must preserve the same advisory-only boundary and must not receive broker, order execution,
or readiness override authority.
