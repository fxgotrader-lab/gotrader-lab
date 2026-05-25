# OpenClaw/Hermes Advisory Request Packet

GoTrader AI Lab can package the current research thesis into a structured JSON packet for future OpenClaw/Hermes advisory review.

This is packet generation only. There is no OpenClaw connection, no Hermes execution layer, no broker connection, no websocket feed, no API key, and no live trading.

## Purpose

The advisory packet gives a future reviewer enough context to critique the research thesis without allowing it to control execution.

It includes:

- packet id and timestamp
- source: `gotrader_ai_lab`
- mode: `advisory_only`
- execution authority: `none`
- broker authority: `none`
- readiness override authority: `none`
- thesis id, symbol, and timeframe
- ICT context summary
- internal agent debate summaries
- CIO thesis
- validation summary when available
- research quality grade when available
- readiness gate status when available
- risk notes
- requested advisory tasks

## Requested Advisory Tasks

The packet asks an advisory reviewer to:

- review the thesis
- identify missing confluence
- identify risk concerns
- suggest calibration changes
- recommend `continue_research`, `rerun_validation`, or `paper_demo_candidate_review`

The advisory response may be useful research feedback, but it cannot approve trades, override readiness gates, place orders, or control go-trader.

## Validation Rules

The packet validator rejects the packet if:

- `mode` is not `advisory_only`
- `executionAuthority` is not `none`
- `brokerAuthority` is not `none`
- `readinessOverrideAuthority` is not `none`
- `source` is not `gotrader_ai_lab`
- `packetId`, `timestamp`, or `thesisId` is missing
- `symbol` or `timeframe` is missing when a thesis exists

The validator warns if:

- validation results are missing
- research quality review is missing
- readiness gate status is missing

Warnings do not make the packet executable. They only indicate that the advisory reviewer has less evidence.

## How To Generate A Packet

1. Open `/research`.
2. Generate or select a thesis.
3. Run `/validation` if current validation context is needed.
4. Run `/research-quality` if quality review context is needed.
5. Open `/readiness-gate` if readiness context is needed.
6. Open `/advisory-agents`.
7. Click `Generate Advisory Request Packet`.
8. Review the validation status and warnings.
9. Click `Download advisory packet JSON`.

Sample packet:

`docs/sample-openclaw-hermes-advisory-request.json`

## Local File Workflow

Recommended request export path:

`C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/latest-advisory-request.json`

Use the stable download button:

`Download as latest-advisory-request.json`

Workflow:

1. Generate the advisory request packet in `/advisory-agents`.
2. Download it as `latest-advisory-request.json`.
3. Save it in `advisory/requests/`.
4. Provide the file to OpenClaw/Hermes manually.
5. Save the returned response JSON into `advisory/responses/latest-advisory-response.json`.
6. Paste and import the response in the AI Lab review screen.

Advisory-only. No execution authority. No broker control. No readiness override.

## Local Bridge Script

The local bridge can generate a mock advisory response from the request file:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --once
```

Watch mode is also available:

```bash
node scripts/openclaw-hermes-advisory-bridge.mjs --watch
```

The script writes `advisory/responses/latest-advisory-response.json`, copies valid requests to `advisory/processed/`,
and writes invalid request diagnostics to `advisory/errors/`.

## Future Automation

The local file workflow is the stepping stone before a local OpenClaw bridge or authenticated API. API automation must
preserve the same advisory-only authority locks.

## Safety Boundary

The packet is advisory only. It cannot execute trades or override readiness gates.

Before any future paper/demo broker bridge exists, the system must still pass the readiness gate and manual approval layer under conservative simulation settings.
