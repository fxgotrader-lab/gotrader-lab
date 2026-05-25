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

## Safety Boundary

Advisory responses cannot execute trades, approve trades, or override readiness gates.

A `paper_demo_candidate_review` recommendation is only a research signal that the user should inspect the readiness gate. It does not authorize broker-demo execution.
