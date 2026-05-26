# GPT-5.5 LLM Agent Provider

`scripts/gpt55-llm-agent-provider.mjs` is a secure local-command provider for GoTrader AI Lab LLM research agents.

It keeps OpenAI API calls outside browser code. The frontend stores no API key, makes no model request, and cannot execute the provider directly. A future local bridge or backend process can call this script by sending the restricted LLM research context JSON on stdin or through `--input-file` and reading validated advisory JSON from stdout or `--output-file`.

This provider is research/advisory only. It does not place trades, connect to brokers, modify readiness gates, write execution configs, or control go-trader.

## Environment

Set secrets in your shell only. Do not commit `.env` files.

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
$env:GOTRADER_LLM_AGENT_COMMAND = "node scripts/gpt55-llm-agent-provider.mjs"
```

`GOTRADER_LLM_MODEL` is optional and defaults to `gpt-5.5`.

## Usage

```powershell
node scripts/gpt55-llm-agent-provider.mjs --help
```

Normal provider execution reads request JSON from stdin:

```powershell
Get-Content .\llm\requests\latest-llm-context.json -Raw | node scripts/gpt55-llm-agent-provider.mjs
```

Local file mode reads a request file and writes a response file:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

Validation debug mode writes sanitized raw model output and rejected field names to `llm/errors/`:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --debug-validation --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

Validate a saved response fixture without an API key:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --validate-response-file docs/sample-llm-agent-response.json
```

Dry run validates the local setup and request packet without calling the model:

```powershell
Get-Content .\llm\requests\latest-llm-context.json -Raw | node scripts/gpt55-llm-agent-provider.mjs --dry-run
```

## Stdin Contract

The request must be a GoTrader AI Lab `LLMResearchContextPacket`:

- `source: "gotrader_ai_lab"`
- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`
- `safetyConstraints[]`

The packet may include ICT context, baseline deterministic debate, CIO thesis, validation summary, research quality grade, readiness state, simulation runbook status, and risk notes.

## Required Reviewers

The provider must return all 14 advisory reviewers:

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

The futures market-context reviewers still return advisory responses when data is missing. The order-flow reviewer is
planning-only until DOM, footprint, delta, cumulative delta, or large-print data exists.

## Stdout Contract

On success, stdout contains JSON only: an array of 14 validated advisory responses, one for each required LLM agent.

In `--output-file` mode, the same validated JSON is written to the output file and stdout stays empty.

Each response must include:

- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`
- `bias`
- `confidence`
- `reasoningSummary`
- `riskWarnings[]`
- `missingEvidence[]`
- `suggestedCalibration[]`
- `proceedRecommendation`
- `safetyNotes[]`

Errors are written to stderr and never include API key values. In `--output-file` mode, sanitized error JSON is also written to `llm/errors/`.

If validation fails, `llm/responses/latest-llm-response.json` is not created. This is expected and prevents stale accepted responses from being imported.

## Safety Rejection

The provider rejects model responses that:

- are not valid JSON
- omit required agent responses
- grant execution, broker, or readiness override authority
- suggest placing or sending orders
- suggest connecting to brokers
- suggest bypassing readiness gates
- ask for or expose API keys
- recommend modifying broker permissions or contract size

Rejected responses are not printed to stdout.

The allowed enum `paper_demo_candidate_review` means readiness review only. It does not approve trades, enable paper/demo execution, or bypass readiness gates.
