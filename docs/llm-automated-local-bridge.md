# LLM Automated Local Bridge

The automated local bridge removes the manual context export/import loop from `/llm-agents`.

The app sends the current LLM research context to a localhost-only bridge. The bridge calls the secure GPT provider, writes the validated response file, and returns the advisory response to the app for automatic import.

```text
Frontend /llm-agents
  -> http://127.0.0.1:8787/llm/run-advisory
  -> scripts/gpt55-llm-agent-provider.mjs
  -> OpenAI Responses API
  -> validated advisory response
  -> frontend displays/imports automatically
```

## Start The Bridge

From `C:/Users/andre/OneDrive/Documents/gotrader`:

```powershell
$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/llm-local-bridge-server.mjs
```

Or:

```powershell
npm run llm:bridge
```

Then open:

```text
http://127.0.0.1:5173/llm-agents
```

Click:

```text
Run GPT Advisory Review
```

## Safety Boundary

The bridge is local development only:

- `OPENAI_API_KEY` stays in the local bridge/server environment
- no browser API keys
- no `VITE_OPENAI_API_KEY`
- no committed `.env`
- no broker execution
- no live trading
- no Tradovate or TopStep integration
- no websocket feeds
- no multi-account or copy-trading
- no readiness override
- no order execution

The bridge binds to `127.0.0.1` and accepts CORS only from:

- `http://127.0.0.1:5173`
- `http://localhost:5173`

## Output Files

Validated GPT responses are written to:

```text
llm/responses/latest-llm-response.json
```

Sanitized failures are written to:

```text
llm/errors/
```

If the response file is not created, validation failed or the bridge was missing a safe requirement. That is expected behavior.

## Manual Fallback

The manual file workflow remains available under the Advanced Manual Workflow section on `/llm-agents`.

Use it when:

- the bridge server is not running
- you want to inspect the context before sending it
- you want a saved request/response artifact for debugging

## What The Bridge Cannot Do

The bridge cannot:

- execute trades
- approve trades
- connect to brokers
- call go-trader execution paths
- mutate readiness gates
- apply calibration proposals automatically
- store or reveal API keys
