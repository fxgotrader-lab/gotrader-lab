# LLM Local File Workflow

This workflow lets GoTrader AI Lab test real GPT-5.5 advisory responses without exposing API keys to browser code.

The browser exports a restricted research context packet. PowerShell runs the local GPT provider with `OPENAI_API_KEY` from the shell environment. The browser then imports the validated response JSON.

## Safety Scope

This is research/advisory only:

- no browser API keys
- no broker execution
- no live trading
- no Tradovate or TopStep integration
- no websocket feeds
- no multi-account or copy-trading
- no readiness override
- no order execution

LLM responses cannot execute trades, approve trades, or override readiness gates.

## Folder Contract

Recommended request file:

```text
C:/Users/andre/OneDrive/Documents/gotrader/llm/requests/latest-llm-context.json
```

Recommended response file:

```text
C:/Users/andre/OneDrive/Documents/gotrader/llm/responses/latest-llm-response.json
```

Provider errors in file mode are written to:

```text
C:/Users/andre/OneDrive/Documents/gotrader/llm/errors/
```

Generated JSON files in those folders are git-ignored. `.gitkeep` files keep the folders in version control.

## Step 1: Export Context From AI Lab

Open:

```text
http://127.0.0.1:5173/llm-agents
```

Click:

```text
Download as latest-llm-context.json
```

Save the file as:

```text
llm/requests/latest-llm-context.json
```

The packet is validated before export. It must remain:

- `mode: "advisory_only"`
- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`

## Step 2: Run GPT-5.5 Provider Locally

Run from the repo root:

```powershell
cd C:\Users\andre\OneDrive\Documents\gotrader

$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/gpt55-llm-agent-provider.mjs --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

The API key stays in PowerShell. It is not stored in the browser, React source, docs, localStorage, or committed files.

If the key is missing or the response is unsafe, the provider exits with a safe nonzero status and writes sanitized error JSON to `llm/errors/`.

If `llm/responses/latest-llm-response.json` is missing after a run, that is expected when validation rejects the model output. The provider removes the requested output file before a new file-mode run so stale responses are not mistaken for a fresh valid result.

To inspect the failure, open the newest JSON file in:

```text
llm/errors/
```

For deeper validation debugging, run:

```powershell
node scripts/gpt55-llm-agent-provider.mjs --debug-validation --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
```

Debug validation writes sanitized raw model output and rejected field names into `llm/errors/` only. It must not print API keys.

## Step 3: Import Response Back Into AI Lab

Open:

```text
llm/responses/latest-llm-response.json
```

Copy the JSON, paste it into the import area on `/llm-agents`, then click:

```text
Validate imported response
Import response locally
```

The imported response must include all required LLM agents and pass advisory-only validation.

`paper_demo_candidate_review` is an allowed advisory enum value. It means "review whether readiness evidence is sufficient." It is not approval to trade, not paper execution, and not permission to bypass readiness gates.

## What Gets Tracked

AI Lab stores local metadata for:

- latest LLM context export timestamp
- latest LLM response import timestamp
- total LLM contexts exported
- total LLM responses imported
- unsafe response rejections

## Why This Exists

The browser cannot safely hold API keys or spawn local commands. This file workflow is the stepping stone before a future secure local bridge, backend endpoint, Supabase Edge Function, or provider service.

The LLM can suggest calibration changes. Those suggestions still must be simulation-tested and manually approved. They cannot alter broker settings, execution permissions, or readiness gates.
