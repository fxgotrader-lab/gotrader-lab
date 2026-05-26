# LLM-Powered Research Agents

GoTrader AI Lab requires LLM-powered advisory agents for real research mode. The deterministic ICT engine and internal rule-based agents remain important, but they are no longer the primary research-agent system.

The deterministic engine provides facts. LLM agents provide reasoning review.

This layer is research/advisory only. It does not add broker execution, Tradovate, TopStep, websocket feeds, API keys, readiness overrides, order placement, or live trading.

## Required Modes

| Mode | Purpose |
| --- | --- |
| `llm_required` | Production research mode. A configured LLM provider is required before advisory research can be marked complete. |
| `deterministic_fallback` | Offline tests, safety comparison, and non-LLM baseline only. Not sufficient for Paper-Demo Candidate. |
| `mock_llm` | UI testing only. Not sufficient for Paper-Demo Candidate. |
| `local_command` | Preferred first real provider path. AI Lab sends JSON to a secure local command bridge through stdin and expects JSON on stdout. |
| `future_api` | Planning only until a backend endpoint, Supabase Edge Function, or secure provider service exists. |

## Required LLM Agents

1. LLM ICT Liquidity Reviewer
2. LLM Market Structure Reviewer
3. LLM Session Timing Reviewer
4. LLM Risk/Reward Reviewer
5. LLM Validation Reviewer
6. LLM Self-Improvement Reviewer
7. LLM CIO Synthesis Reviewer
8. LLM Session Levels Reviewer
9. LLM Auction/Volume Profile Reviewer
10. LLM Macro Event Risk Reviewer
11. LLM Intermarket Confirmation Reviewer
12. LLM Positioning/Gamma Reviewer
13. LLM Volatility Regime Reviewer
14. LLM Order Flow Planning Reviewer

Equity-style sector reviewers are deprecated for the main futures workflow. ES/NQ/YM/MES/MNQ research gets more
useful signal from direct futures context: session levels, auction/volume profile, macro event risk, intermarket
confirmation, positioning/gamma, volatility regime, and later order flow.

The futures market-context reviewers are required even when the relevant provider data is still mock, imported, or
missing. In that case they should return `no_opinion`, name the missing evidence, and recommend continued research or
validation. The Order Flow Planning Reviewer is advisory/planning only and does not require live DOM, footprint, delta,
cumulative delta, or large-print feeds yet.

Each agent receives a restricted research context packet:

- symbol
- timeframe
- ICT context summary
- futures market context summary
- deterministic ICT facts
- internal baseline agent debate
- CIO thesis
- validation summary
- research quality grade
- readiness state
- risk notes
- simulation runbook status
- explicit safety constraints

## Response Contract

Each LLM agent must return valid JSON:

```json
{
  "agentId": "llm-risk-reward-reviewer",
  "agentName": "LLM Risk/Reward Reviewer",
  "mode": "advisory_only",
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none",
  "bias": "neutral",
  "confidence": 0.62,
  "agreesWithBaseline": true,
  "reasoningSummary": "Risk/reward is acceptable in simulation but needs broader validation.",
  "riskWarnings": ["Drawdown clustering needs more review."],
  "missingEvidence": ["No walk-forward validation yet."],
  "suggestedCalibration": ["Test a higher confidence threshold."],
  "proceedRecommendation": "rerun_validation",
  "safetyNotes": ["Advisory only.", "No execution authority."]
}
```

AI Lab rejects responses that:

- are not valid JSON
- change `mode` away from `advisory_only`
- set execution, broker, or readiness override authority
- suggest direct trade execution
- claim authority to approve paper/live execution
- attempt to modify broker or risk permissions
- recommend bypassing the readiness gate

## Security Boundary

LLM API keys must never live in frontend code. Do not hardcode keys. Do not commit `.env` files.

Real model calls must go through a secure provider boundary:

- local command bridge
- backend endpoint
- Supabase Edge Function
- future secure provider service

The first preferred real path is `local_command`. A secure local GPT-5.5 provider is available at:

```powershell
node scripts/gpt55-llm-agent-provider.mjs
```

Example local command configuration outside the frontend:

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
$env:GOTRADER_LLM_AGENT_COMMAND = "node scripts/gpt55-llm-agent-provider.mjs"
```

The local bridge should:

1. read the restricted context JSON from stdin
2. call the real provider outside the browser through the OpenAI Responses API
3. return structured advisory JSON on stdout
4. reject any execution or readiness override authority

The browser frontend cannot spawn this command directly.

For manual testing, use the local file workflow:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

See `docs/gpt55-api-setup.md`, `docs/llm-local-file-workflow.md`, and `scripts/README-gpt55-llm-provider.md` for the local provider setup.

## Readiness Impact

Paper-Demo Candidate cannot be achieved in real research mode unless LLM advisory review has passed through a configured provider.

If no provider is configured, readiness must show:

> LLM advisory review required before Paper-Demo Candidate.

Deterministic fallback may support Research Ready, but not Paper-Demo Candidate.

## Self-Improvement Integration

LLM `suggestedCalibration` values may seed a calibration proposal in the Self-Improvement page.

Those proposals still must:

- remain simulation-only
- avoid broker or execution permissions
- avoid readiness overrides
- change one variable or small grouped set at a time
- be tested against mock backtest/validation data
- improve stability, not merely profit
- receive user approval before active calibration settings change

LLMs cannot execute trades, approve trades, or control go-trader.

## In-App Communication

LLM advisory output should flow into GoTrader AI Lab as in-app research messages, not as primary Discord-first chat.
The `/communications` page is the planned message inbox for:

- LLM advisor messages
- validation alerts
- self-improvement proposal alerts
- readiness warnings
- risk warnings

This keeps reviews and approvals attached to the app audit trail. External tools such as Discord, Telegram, or Hermes
may later mirror notifications, but they should not become the source of authority for calibration approval, readiness
approval, broker control, or execution commands.

LLM agents remain advisory only:

- execution authority: none
- broker authority: none
- readiness override authority: none
- API keys not displayed in browser
