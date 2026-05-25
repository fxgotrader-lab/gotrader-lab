# OpenClaw/Hermes Advisory Response Review

GoTrader AI Lab can import a future OpenClaw/Hermes advisory response as local research feedback.

This is import and review only. There is no live OpenClaw connection, no Hermes execution layer, no broker connection, no API key, no websocket feed, and no live trading.

## Response Shape

An advisory response must include:

- `responseId`
- `packetId`
- `timestamp`
- `advisoryAgent`
- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`
- `agreeWithThesis`
- `advisoryConfidence`
- `riskWarnings`
- `missingEvidence`
- `recommendedCalibration`
- `proceedRecommendation`
- `notes`

Allowed proceed recommendations are:

- `continue_research`
- `rerun_validation`
- `paper_demo_candidate_review`

None of these recommendations can place trades, approve trades, or override the readiness gate.

## Validation Rules

AI Lab rejects the response if:

- `mode` is not `advisory_only`
- `executionAuthority` is not `none`
- `brokerAuthority` is not `none`
- `readinessOverrideAuthority` is not `none`
- `proceedRecommendation` is not one of the advisory-only recommendations
- `packetId` is missing
- required identity or confidence fields are missing

AI Lab warns if:

- risk warnings are empty
- notes are missing

## How To Use

1. Open `/advisory-agents`.
2. Paste the advisory response JSON.
3. Click `Validate response`.
4. Review errors and warnings.
5. Click `Import response locally` only if the response is valid.
6. Review the summary, risk warnings, missing evidence, calibration suggestions, and proceed recommendation.

Sample response:

`docs/sample-openclaw-hermes-advisory-response.json`

## Local File Workflow

Recommended response import path:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/latest-advisory-response.json`

Workflow:

1. Export the advisory request packet from AI Lab.
2. Save it as `advisory/requests/latest-advisory-request.json`.
3. Provide the request file to OpenClaw/Hermes manually.
4. Save the advisory response as `advisory/responses/latest-advisory-response.json`.
5. Open the response file and copy the JSON payload.
6. Paste it into the AI Lab advisory response review screen.
7. Validate and import it locally.

Advisory-only. No execution authority. No broker control. No readiness override.

## Local Bridge Script

To produce a mock advisory response from a saved request file, run:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --once
```

The script writes:

`advisory/responses/latest-advisory-response.json`

It uses:

`advisoryAgent: "openclaw_hermes_local_bridge_mock"`

That mock agent is accepted by the AI Lab response validator only as advisory feedback. It still has no execution,
broker, or readiness override authority.

## Future Automation

The local file workflow is the stepping stone before a local OpenClaw bridge or authenticated API. Any future automation
must keep response import as advisory review only and must not grant execution, broker, or readiness override authority.

## Safety Boundary

Advisory responses cannot execute trades, approve trades, or override readiness gates.

A `paper_demo_candidate_review` recommendation is only a research signal that the user should inspect the readiness gate. It does not authorize broker-demo execution.
