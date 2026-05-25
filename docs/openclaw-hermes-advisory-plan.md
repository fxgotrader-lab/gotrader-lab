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

## Safety Boundary

The advisory layer is a research reviewer. It cannot execute, approve, override, connect, or control anything. The readiness gate and manual approval layer remain the source of local simulation readiness state.
