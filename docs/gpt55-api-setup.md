# GPT-5.5 API Setup

GoTrader AI Lab can use GPT-5.5 for required LLM research agents through a secure local-command provider.

This setup keeps model calls outside the browser. No OpenAI API key is stored in React code, localStorage, committed files, or docs.

## Safety Scope

The GPT provider is advisory only:

- no broker execution
- no live trading
- no Tradovate or TopStep connection
- no API keys committed
- no websocket feeds
- no multi-account or copy-trading
- no readiness override
- no order execution

LLM agents may review research context and suggest calibration changes. They cannot execute trades or approve paper/live execution.

## PowerShell Setup

Run these commands in your local shell before starting the future local command bridge:

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
$env:GOTRADER_LLM_AGENT_COMMAND = "node scripts/gpt55-llm-agent-provider.mjs"
```

`OPENAI_API_KEY` is required. `GOTRADER_LLM_MODEL` is optional and defaults to `gpt-5.5`.

## Provider Script

The provider script is:

```powershell
node scripts/gpt55-llm-agent-provider.mjs
```

It reads a restricted LLM research context packet from stdin or `--input-file`, calls the OpenAI Responses API at:

```text
POST https://api.openai.com/v1/responses
```

It requests structured JSON output and prints only validated advisory response JSON to stdout. In file mode, it writes the validated response to `--output-file`.

## Check The Provider

Help:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --help
```

Dry validation:

```powershell
Get-Content .\llm\requests\latest-llm-context.json -Raw | node scripts/gpt55-llm-agent-provider.mjs --dry-run
```

If `OPENAI_API_KEY` is missing, the script exits with a safe missing-key error on stderr. It must not print or expose any secret.

## Local File Workflow

The recommended app workflow is now the automated localhost bridge:

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/llm-local-bridge-server.mjs
```

Then use `/llm-agents` and click `Run GPT Advisory Review`.

The manual fallback workflow is:

1. Open `/llm-agents`.
2. Download the context as `latest-llm-context.json`.
3. Save it to `llm/requests/latest-llm-context.json`.
4. Run the provider with an input file and output file.
5. Paste/import `llm/responses/latest-llm-response.json` back into `/llm-agents`.

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/gpt55-llm-agent-provider.mjs --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

See `docs/llm-automated-local-bridge.md` and `docs/llm-local-file-workflow.md` for the full workflows.

If the model response is rejected, `llm/responses/latest-llm-response.json` will not be created. This is expected. Inspect the newest sanitized JSON file in `llm/errors/`.

For field-level validation diagnostics:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --debug-validation --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

`paper_demo_candidate_review` is advisory review only. It does not approve trades, enable paper/demo execution, or override readiness gates.

## Response Contract

The model must return one advisory response for each required LLM agent:

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

The futures market-context reviewers are required even when data is still mock or missing. They should identify missing
evidence and keep confidence appropriately capped. The Order Flow Planning Reviewer is advisory/planning only and must not
require live DOM, footprint, delta, cumulative delta, or large-print feeds yet.

Every response must include:

- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`
- `bias`
- `confidence`
- `agreesWithBaseline`
- `reasoningSummary`
- `riskWarnings[]`
- `missingEvidence[]`
- `suggestedCalibration[]`
- `proceedRecommendation`
- `safetyNotes[]`

## Rejection Rules

The provider rejects unsafe responses if they:

- suggest direct trade execution
- claim authority to approve paper/live execution
- connect to a broker
- modify broker or risk permissions
- request or expose API keys
- recommend bypassing the readiness gate
- return invalid JSON

Rejected responses are not printed to stdout.

## Future Integration

This provider is the first secure local provider boundary. A future local bridge, backend endpoint, Supabase Edge Function, or secure service can invoke it. The frontend must continue to avoid direct API calls and must never store model API keys.

## OpenAI References

- [Responses API create reference](https://platform.openai.com/docs/api-reference/responses/create)
- [Structured outputs guide](https://platform.openai.com/docs/guides/structured-outputs)
