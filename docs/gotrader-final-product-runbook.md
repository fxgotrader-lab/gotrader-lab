# GoTrader AI Lab — Final Product Runbook

Research-only trading workbench. **No broker execution, no live trading, no order placement.**

Authority boundaries (always `none`):

- `executionAuthority`
- `brokerAuthority`
- `readinessOverrideAuthority`

---

## 1. Start GoTrader (browser app)

```powershell
cd C:\Users\andre\OneDrive\Documents\gotrader
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (or the URL Vite prints). Default route redirects to `/dashboard`.

Production preview:

```powershell
npm run build
npm run preview
```

---

## 2. Start MT5 read-only stack

GoTrader reads candles through the **MT5 read-only bridge** — GET/OPTIONS only, no orders or account mutation.

```powershell
npm run mt5:readonly-bridge
npm run mt5:readonly-diagnose
```

In the app:

1. **Home** → Dashboard → **Activate Market** (or **Advisor** → **Source** tab → configure symbol/timeframe → Activate Market).
2. Confirm the **global source bar** shows `MT5 read-only active` (not mock/sample).
3. **Data** → Market Data for advanced import/troubleshooting.

**CFD/proxy note:** broker symbol (e.g. `USTECH`) may differ from requested symbol (e.g. `MNQ`). The UI labels this as CFD/proxy — not CME broker truth.

---

## 3. Start local LLM bridge (optional)

Deterministic chat works without any LLM. For local LLM advisory:

```powershell
npm run llm:bridge
```

Configure provider mode in **Settings** or the Advisor **OpenClaw** tab diagnostics. Unset/missing bridge → classified as offline/not configured (not an app failure).

---

## 4. Start phone OpenClaw bridge + skill server (optional)

Advisory/proposal-only. No auto-apply, no readiness override.

**Phone Terminal 1 — skill server:**

```bash
node ~/openclaw-gotrader-advisory-skill-server.mjs
```

**Phone Terminal 2 — phone bridge:**

```bash
export OPENCLAW_AGENT_ENDPOINT="http://127.0.0.1:8798/gotrader/advisory-skill"
export OPENCLAW_AGENT_TIMEOUT_MS=15000
node ~/openclaw-phone-advisory-bridge.mjs
```

On the PC, set `OPENCLAW_ADVISORY_URL` to the phone bridge URL (see `docs/openclaw-phone-bridge-runbook.md`).

In Advisor → **OpenClaw** tab:

- **OpenClaw bridge stub** — bridge reachable but skill routing not wired (not ordinary success).
- **Skill-routed** — full advisory path active (still authority none).
- **Not configured** — URL unset (expected in dev).

---

## 5. Source consistency checklist

Verify the same source context everywhere:

| Surface | What to check |
|--------|----------------|
| Global top source bar | Requested symbol, broker symbol, TF, HTF, status badge |
| Page `SourceStatusBanner` | Fingerprint, candle count, mock warning |
| Dashboard command overview | Source line matches Advisor source controls |
| ICT Lab | Mock/sample labeled “sample-only, not research evidence” |

**Rule:** Mock/sample data is never research evidence. Queue validation only after MT5 read-only is active.

Quick test:

```powershell
npm run test:source-status
```

---

## 6. Validation workflow (recognition → Paper-Demo)

1. **ICT Lab** — universal recognition (not evidence).
2. **Queue replay validation** — requires MT5 active (not mock).
3. **Replay** — frozen snapshot, preliminary evidence.
4. **Walk-Forward** — stronger OOS evidence.
5. **Evidence Quality / Research Maturity** — ledger scores.
6. **Paper-Demo Candidate checklist** — reporting-only; cannot promote readiness or execute.

Validation chain state persists in browser `localStorage` (compact summaries only — no raw candles).

```powershell
npm run test:validation-chain
```

---

## 7. Full validation suite

Run before release or after UI changes:

```powershell
npm run build
npm run smoke:routes
npm run test
npm run test:source-status
npm run test:validation-chain
npm run test:advisor-provider-status
npm run test:mt5-readonly
npm run test:mt5-readonly-safety
npm run test:openclaw-advisory
npm run test:openclaw-phone-bridge
npm run test:openclaw-skill-server
npm run test:ict-universal-recognition
npm run test:auto-research-candidate
git diff --check
```

**Expected optional states (not failures):**

- `OPENCLAW_ADVISORY_URL` unset → `openclaw_not_configured`
- Local LLM bridge not running → offline/not configured
- OpenClaw stub mode → advisory readable but labeled stub

---

## 8. Navigation (8 hubs)

| Hub | Primary routes |
|-----|----------------|
| Home | `/dashboard`, `/performance` |
| Advisor | `/advisor`, `/research-advisor` |
| Data | `/market-data`, `/ict-lab`, `/research` |
| Validate | `/replay`, `/walk-forward`, `/backtest-lab`, … |
| Evidence | `/evidence-quality`, `/research-maturity`, … |
| Automate | `/self-improvement`, `/autonomous-research`, … |
| Agents | `/agent-debate`, `/advisory-agents`, … |
| Settings | `/settings` |

Workspace tabs in the top bar reach sibling routes within each hub. Footer strip: **Research only · MT5 read-only · Authority none**.

---

## 9. Safety boundaries (do not bypass)

- No MT5 mutation, orders, positions, or account changes from GoTrader.
- No broker execution or live trading controls in the UI.
- No raw candle arrays to LLM/OpenClaw/gbrain.
- OpenClaw responses with unsafe authority are rejected and cannot change validation state.
- Paper-Demo / Research Ready labels are **reporting only** — they do not enable trading.

See also `AGENT-CONTEXT.md` and `docs/openclaw-pilot-phased-plan.md`.
