# OpenClaw / Hermes Advisory Agent Plan

GoTrader AI Lab may eventually send simulation research context to OpenClaw or Hermes for advisory review only.

This plan does not add a live OpenClaw API connection, Hermes execution, broker execution, live trading, Tradovate, TopStep, API keys, websocket feeds, or multi-account/copy-trading.

## Role

OpenClaw and Hermes may review:

- ICT context
- agent debate
- CIO thesis
- validation results
- research quality grade
- readiness gate status
- risk notes

They may return:

- agree or disagree
- risk concerns
- missing confluence
- suggested calibration change
- advisory confidence
- do not proceed warning

## Prohibited Authority

OpenClaw and Hermes must not:

- place trades
- approve trades
- override readiness gate
- connect to broker
- change live settings
- execute handoff
- control go-trader

## Example Request

```json
{
  "thesisId": "thesis_sim_001",
  "symbol": "NQ",
  "timeframe": "5m",
  "ictContext": {
    "bias": "bearish",
    "confluenceScore": 0.62,
    "narrativeSummary": "Mock ICT context shows a liquidity sweep and bearish MSS."
  },
  "cioThesis": {
    "bias": "bearish",
    "confidence": 0.68,
    "summary": "CIO favors a simulated short thesis.",
    "riskNotes": "Research-only, no order execution."
  },
  "validationSummary": {
    "readinessStatus": "yellow",
    "readinessScore": 58
  },
  "researchQualityGrade": {
    "readinessGrade": "Research Ready"
  },
  "readinessStatus": {
    "state": "Research Ready",
    "failedRequirements": ["Research Quality is not Paper-Demo Candidate"],
    "brokerExecutionDisabled": true
  },
  "mode": "simulation",
  "advisoryOnly": true
}
```

## Example Response

```json
{
  "advisoryAgent": "OpenClaw",
  "agreeWithThesis": false,
  "riskWarnings": ["Conservative validation has not reached Paper-Demo Candidate."],
  "missingEvidence": ["Repeatable NY AM session stability"],
  "recommendedCalibration": ["Rerun validation with conservative confluence >= 0.55."],
  "advisoryConfidence": 0.74,
  "proceedRecommendation": "rerun_validation",
  "executionAuthority": "none",
  "readinessOverrideAuthority": "none"
}
```

## Local File Workflow

Before any API automation, AI Lab uses a local file workflow:

1. Export an advisory request packet from `/advisory-agents`.
2. Save it as:

   `C:/Users/andre/OneDrive/Documents/gotrader/advisory/requests/latest-advisory-request.json`

3. Provide the file to OpenClaw/Hermes manually.
4. Save the returned response as:

   `C:/Users/andre/OneDrive/Documents/gotrader/advisory/responses/latest-advisory-response.json`

5. Paste/import the response into the AI Lab advisory review screen.

Advisory-only. No execution authority. No broker control. No readiness override.

## Future Automation

The local file workflow is the stepping stone before a local OpenClaw bridge or authenticated API. Future automation may
move files or call an authenticated advisory endpoint, but it must not execute trades, approve trades, control go-trader,
connect to a broker, or override readiness gates.

The planning-only local bridge contract is defined in:

`docs/openclaw-hermes-local-bridge.md`

## App-First Communication

GoTrader AI Lab should be the primary communication layer for OpenClaw/Hermes advisory review. Discord, Telegram, or
Hermes-style chat may send optional notifications, but approvals and audit history should remain inside the app.

Future OpenClaw/Hermes messages should appear in `/communications` as advisory-only agent messages with:

- source and timestamp
- category and severity
- linked thesis/proposal/validation/readiness IDs
- action required status
- user response
- resolved status

OpenClaw/Hermes may recommend research actions, but they cannot approve trades, execute handoffs, control brokers, or
override readiness gates.

## Safety Boundary

The advisory layer is a research reviewer. It cannot execute, approve, override, connect, or control anything. The readiness gate and manual approval layer remain the source of local simulation readiness state.
