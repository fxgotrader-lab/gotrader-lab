# OpenClaw Phone Advisory Bridge Runbook

This runbook starts the runnable GoTrader/OpenClaw phone advisory bridge in Termux/Ubuntu on Android. The bridge is an immediate safe stub. It returns valid `OpenClawAdvisoryResponse` JSON now and can later be wired into OpenClaw/Hermes internals through `OPENCLAW_AGENT_ENDPOINT`.

The bridge is advisory-only. It never calls MT5, brokers, accounts, orders, positions, live trading controls, or readiness override paths.

## Files

Source file in GoTrader:

```text
scripts/openclaw-phone-advisory-bridge.mjs
```

Copy this file to the phone, for example into:

```text
~/openclaw-phone-advisory-bridge.mjs
```

## Install Node In Termux

If Node is not already installed:

```bash
pkg update
pkg install nodejs
node --version
```

If using Ubuntu inside Termux, install Node in that environment instead:

```bash
sudo apt update
sudo apt install nodejs
node --version
```

## Start The Bridge On The Phone

Default command:

```bash
node openclaw-phone-advisory-bridge.mjs
```

Default listener:

```text
host: 0.0.0.0
port: 8797
```

Optional overrides:

```bash
export OPENCLAW_PHONE_BRIDGE_HOST=0.0.0.0
export OPENCLAW_PHONE_BRIDGE_PORT=8797
export OPENCLAW_PHONE_BRIDGE_TOKEN="local-token-if-wanted"
export OPENCLAW_AGENT_ENDPOINT=""
node openclaw-phone-advisory-bridge.mjs
```

Do not print or paste the token in logs. If `OPENCLAW_PHONE_BRIDGE_TOKEN` is set, desktop tests should use:

```powershell
$env:OPENCLAW_ADVISORY_TOKEN = "local-token-if-wanted"
```

## Health Check On The Phone

In a second Termux/Ubuntu shell:

```bash
curl http://127.0.0.1:8797/health
```

Expected fields:

```json
{
  "provider": "openclaw_phone",
  "bridgeStatus": "running",
  "advisoryStatus": "stub",
  "authority": {
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
}
```

`advisoryStatus` is `stub` until future OpenClaw/Hermes routing is connected.

## Find The Phone IP

On the phone:

```bash
ip addr show wlan0
```

Look for:

```text
inet 192.168.1.42/24
```

The desktop endpoint is then:

```text
http://192.168.1.42:8797/gotrader/advisory
```

The phone and desktop must be on the same Wi-Fi network unless you intentionally use a tunnel.

## Desktop Diagnostic

From the GoTrader desktop workspace:

```powershell
$env:OPENCLAW_ADVISORY_URL = "http://PHONE_IP:8797/gotrader/advisory"
npm.cmd run test:openclaw-advisory
```

With a token:

```powershell
$env:OPENCLAW_ADVISORY_URL = "http://PHONE_IP:8797/gotrader/advisory"
$env:OPENCLAW_ADVISORY_TOKEN = "local-token-if-wanted"
npm.cmd run test:openclaw-advisory
```

Expected diagnostic result:

```json
{
  "status": "passed",
  "advisoryStatus": "complete",
  "authority": {
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
}
```

The diagnostic does not call MT5 and does not send secrets or candle arrays.

## Dashboard Setup

In GoTrader Dashboard:

1. Open Research Advisor Advanced Details.
2. Set provider to `OpenClaw`.
3. Set OpenClaw advisory URL:

```text
http://PHONE_IP:8797/gotrader/advisory
```

4. Save provider.
5. Ask "Explain this cycle".

The Dashboard should show the phone/local-network provider. Deterministic research remains available if the phone bridge is offline.

## CORS

The bridge allows local GoTrader browser origins:

- `http://127.0.0.1:5173`
- `http://localhost:5173`
- `http://127.0.0.1:4173`
- `http://localhost:4173`

If your desktop uses another origin, update the `allowedOrigins` list in `scripts/openclaw-phone-advisory-bridge.mjs` before copying it to the phone.

## Safety Behavior

The bridge rejects:

- non-GoTrader packet source
- unsafe authority fields
- `autoApplyAllowed: true`
- structural mutation fields such as `placeOrder`, `buyMarket`, `sellMarket`, `closePosition`, `accountMutation`, `positionMutation`, `orderRoute`, or `mt5Credentials`
- user questions that look like direct execution/order/broker requests

The bridge forces every response authority to:

```json
{
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none"
}
```

The bridge does not:

- call MT5
- call broker APIs
- place orders
- mutate account, order, or position data
- approve readiness
- bypass GoTrader gates
- expose secrets

## Future OpenClaw/Hermes Routing

`OPENCLAW_AGENT_ENDPOINT` is reserved for later. When connected, the bridge should still:

- validate GoTrader packet authority first
- send compact advisory context only
- reject unsafe downstream responses
- preserve `autoApplyAllowed: false`
- preserve authority none

Until that is implemented, the bridge returns a safe stub advisory with top blockers derived from the GoTrader packet.
