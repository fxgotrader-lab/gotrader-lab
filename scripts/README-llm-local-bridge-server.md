# LLM Local Bridge Server

`scripts/llm-local-bridge-server.mjs` runs a localhost-only development bridge for `/llm-agents`.

It lets the React app send an advisory context packet to:

```text
POST http://127.0.0.1:8787/llm/run-advisory
```

You can verify the server without sending any advisory context:

```text
GET http://127.0.0.1:8787/health
```

Opening the root URL returns a helpful JSON status message:

```text
GET http://127.0.0.1:8787/
```

The bridge then calls:

```text
scripts/gpt55-llm-agent-provider.mjs
```

The provider owns the OpenAI Responses API call and validates the advisory-only LLM output.

## Start

From the repo root:

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/llm-local-bridge-server.mjs
```

Or:

```powershell
npm run llm:bridge
```

## Security

- Binds only to `127.0.0.1`
- Allows CORS only from local Vite dev origins on ports `5173` through `5179`:
  - `http://127.0.0.1:5173` through `http://127.0.0.1:5179`
  - `http://localhost:5173` through `http://localhost:5179`
- Requires `OPENAI_API_KEY` in the server environment
- Does not expose API keys to the browser
- Does not call brokers or go-trader
- Does not mutate readiness gates
- Does not apply self-improvement proposals automatically

## Response Files

Successful validated responses are written to:

```text
llm/responses/latest-llm-response.json
```

Sanitized errors are written to:

```text
llm/errors/
```

If the response file is missing after a run, the provider rejected the model output or the bridge could not run safely.

## Help

```powershell
node scripts/llm-local-bridge-server.mjs --help
```

## Endpoints

- Bridge URL: `http://127.0.0.1:8787`
- Health check: `GET /health`
- Advisory endpoint: `POST /llm/run-advisory`

The API key remains only in the PowerShell bridge environment. The React app never receives it.
