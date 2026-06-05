# OpenClaw Phone Advisory Bridge For GoTrader

This guide connects desktop GoTrader to the user's existing OpenClaw setup running in Termux/Ubuntu on Android. The phone bridge is advisory and calibration-only. It does not receive broker authority, execution authority, readiness override authority, MT5 credentials, order routes, account state, position mutation, or raw candle arrays.

## Target Architecture

```text
Desktop GoTrader
  -> POST compact GoTraderAdvisoryPacket over local Wi-Fi
  -> Android Termux/Ubuntu OpenClaw advisory bridge
  -> OpenClaw GoTrader advisory skill
  -> OpenClawAdvisoryResponse
  -> Dashboard Research Advisor
```

Default phone endpoint shape:

```text
http://192.168.x.x:8797/gotrader/advisory
```

Use the phone's actual LAN IP address in place of `192.168.x.x`.

## GoTrader Configuration

Set the advisory provider in the Dashboard Research Advisor Advanced Details:

```text
Provider: openclaw
OpenClaw advisory URL: http://PHONE_LOCAL_IP:8797/gotrader/advisory
```

PowerShell example:

```powershell
$env:OPENCLAW_ADVISORY_URL = "http://192.168.x.x:8797/gotrader/advisory"
$env:OPENCLAW_ADVISORY_TIMEOUT_MS = "30000"
```

Optional diagnostic token for scripts or a future desktop-side proxy:

```powershell
$env:OPENCLAW_ADVISORY_TOKEN = "your-local-token"
```

Do not expose `OPENCLAW_ADVISORY_TOKEN` as `VITE_*`, paste it into the frontend, commit it, or put it in OpenClaw packets. The Dashboard stores only the advisory URL. Status readouts show the endpoint host, not a token.

## Start OpenClaw On Android

The exact command depends on the user's Termux/Ubuntu OpenClaw installation. The bridge only needs to expose one HTTP endpoint:

```http
POST /gotrader/advisory
```

Generic Termux/Ubuntu flow:

```bash
termux-wake-lock
cd ~/openclaw
# activate the OpenClaw environment used by the phone installation
# example only:
# source .venv/bin/activate
```

Copy the runnable bridge script from GoTrader to the phone, then start it so it binds to all phone interfaces:

```bash
node openclaw-phone-advisory-bridge.mjs
```

The script defaults to:

```text
OPENCLAW_PHONE_BRIDGE_HOST=0.0.0.0
OPENCLAW_PHONE_BRIDGE_PORT=8797
```

Optional OpenClaw skill routing:

```bash
export OPENCLAW_AGENT_ENDPOINT="http://127.0.0.1:8897/gotrader/advisory-skill"
export OPENCLAW_AGENT_TIMEOUT_MS=15000
node openclaw-phone-advisory-bridge.mjs
```

If `OPENCLAW_AGENT_ENDPOINT` is not set, the bridge returns the safe stub response. If it is set but unreachable or unsafe, the bridge returns a safe unavailable response instead of proxying the failure to GoTrader.

See `docs/openclaw-phone-bridge-runbook.md` for copy, install, token, local test, routing, and desktop test steps.

If the phone setup uses Hermes/Telegram for routing, start Hermes after OpenClaw is available. Hermes may notify or route review text, but GoTrader should still call only the GoTrader advisory endpoint for structured responses.

## Find The Phone LAN IP

On Android/Termux:

```bash
ip addr show wlan0
```

Look for an address like:

```text
inet 192.168.1.42/24
```

The GoTrader URL would then be:

```text
http://192.168.1.42:8797/gotrader/advisory
```

## Network Notes

- Desktop and phone must be on the same Wi-Fi network unless using a tunnel.
- The phone bridge must bind to `0.0.0.0`, not only `127.0.0.1`, so the desktop can reach it.
- The phone bridge must allow browser CORS from the GoTrader desktop origin, usually `http://127.0.0.1:5173` during development and the local preview origin when testing a build.
- If the bridge supports `OPTIONS`, return the same advisory-only CORS policy there. Do not expose credentials or wildcard sensitive headers.
- Android battery optimization can pause Termux; use `termux-wake-lock` during a session.
- Some Wi-Fi networks block client-to-client traffic. If desktop cannot reach the phone, test from desktop:

```powershell
Invoke-WebRequest http://PHONE_LOCAL_IP:8797/health
```

If the phone bridge has no health endpoint, use the GoTrader diagnostic command below.

## Diagnostic Test

From the GoTrader desktop workspace:

```powershell
$env:OPENCLAW_ADVISORY_URL = "http://PHONE_LOCAL_IP:8797/gotrader/advisory"
npm.cmd run test:openclaw-advisory
```

The diagnostic:

- sends a compact sample `GoTraderAdvisoryPacket`
- does not call MT5
- does not send candle arrays
- does not send secrets in the packet body
- can send `OPENCLAW_ADVISORY_TOKEN` as an Authorization header when configured
- requires the response authority fields to remain `none`
- exits successfully when the phone endpoint is not configured or offline, because deterministic GoTrader research still works without OpenClaw

If the endpoint is online but returns an invalid or unsafe response, the diagnostic fails so the bridge contract can be fixed before using it in the Dashboard.

## Required Response Contract

OpenClaw should return either `OpenClawAdvisoryResponse` directly or wrapped as `{ "response": ... }`.

Minimum response:

```json
{
  "advisoryStatus": "complete",
  "summary": "Advisory-only research review.",
  "topBlockers": [],
  "nextActions": [],
  "calibrationRecommendations": [],
  "riskNotes": [],
  "questions": [],
  "authority": {
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
}
```

Optional proposal intent:

```json
{
  "selfImprovementProposalIntent": {
    "createProposal": true,
    "proposalTitle": "Draft calibration review",
    "targetSubsystem": "Grinch profile selector",
    "candidateFamilies": ["reversal_expansion_confirmation"],
    "requiresWalkForward": true,
    "autoApplyAllowed": false
  }
}
```

`autoApplyAllowed` must remain `false`.

## Phone Bridge Downstream Skill Contract

When `OPENCLAW_AGENT_ENDPOINT` is set, the phone bridge sends a compact sanitized packet to the configured phone-local OpenClaw advisory skill endpoint. The downstream skill should expose:

```http
POST /gotrader/advisory-skill
```

The downstream skill receives only compact research context. It must not expect raw candles, MT5 credentials, screenshots, account state, order state, position state, or secrets.

If the downstream skill is offline, times out, returns non-JSON, returns unsafe authority, or includes structural execution/account/order/position fields, the phone bridge returns:

```json
{
  "advisoryStatus": "unavailable",
  "summary": "Phone OpenClaw bridge could not complete live OpenClaw skill routing...",
  "authority": {
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
}
```

The bridge test command verifies stub, invalid-endpoint, and valid mock-skill behavior:

```powershell
npm.cmd run test:openclaw-phone-bridge
```

## Safety Boundary

OpenClaw may:

- explain a cycle
- identify blockers
- suggest calibration families
- review self-improvement proposal intent
- ask follow-up questions
- summarize risk concerns

OpenClaw must not:

- place trades
- instruct GoTrader to place trades
- approve readiness
- bypass readiness, evidence, maturity, walk-forward, or risk gates
- request MT5 credentials
- call MT5, broker, order, account, or position tools
- receive raw candle arrays, account state, order state, position state, screenshots, secrets, or API keys

GoTrader remains the deterministic research engine. OpenClaw is a local-network advisor only.
