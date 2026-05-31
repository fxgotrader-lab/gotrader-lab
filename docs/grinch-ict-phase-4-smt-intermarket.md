# Grinch ICT Phase 4 / SMT Intermarket Confirmation

GoTrader AI Lab now adds SMT / intermarket divergence as a research-only confirmation layer for the Grinch ICT model. It builds on Phase 1 Model 1, Phase 2 Reversal Profile, and Phase 3 Consolidation Profile. SMT can support or weaken an existing thesis, but it cannot create standalone bias, create entries, approve readiness, route orders, or connect to a broker.

## Role

SMT compares related index futures behavior across:

- NQ / MNQ
- ES / MES
- YM / MYM

For MNQ/NQ research, the primary comparison is NQ versus ES. YM is an additional confirmation path when available.

## Confirmation Rules

Bullish SMT appears when one instrument takes sellside liquidity or makes a lower low while the correlated instrument fails to confirm that lower low. This can support a bullish reversal or continuation only when the higher-timeframe bias, PD array reaction, 12AM/Sunday Open context, timing, and active Grinch profile already support that direction.

Bearish SMT appears when one instrument takes buyside liquidity or makes a higher high while the correlated instrument fails to confirm that higher high. This can support a bearish reversal or continuation only after the primary Grinch evidence already exists.

Missing SMT does not invalidate a setup. SMT conflict lowers confidence or blocks weak setups when other evidence is incomplete.

## Unavailable State

If ES or YM correlated candles are not available, the model returns:

- `smtState: unavailable`
- `primaryPair: unavailable`
- `divergenceType: none`
- missing evidence explaining that correlated instruments are absent

This is intentional. Current single-instrument MNQ imports should not be treated as real intermarket confirmation. Evidence Quality marks SMT unavailable instead of counting it as confirmation.

## Outputs

The Phase 4 model emits:

- `smtState`
- `primaryPair`
- `leaderInstrument`
- `nonConfirmingInstrument`
- `liquidityTaken`
- `divergenceType`
- `supportsBias`
- `supportsActiveProfile`
- `confidenceAdjustment`
- `conflictWarning`
- `reasons`
- `missingEvidence`

All outputs are advisory and simulation-only.

## Integrations

Phase 4 is wired into:

- ICT Lab SMT panel.
- Dashboard runtime advanced details.
- Internal agent roster through the SMT / Intermarket Divergence Agent.
- Agent Debate via the new deterministic agent opinion.
- LLM context packet through `grinchSmtSummary`.
- Auto Research candidate family for SMT confirmation/conflict gating.
- Evidence Quality, where unavailable SMT is explicitly labeled as missing correlated evidence.
- ResearchRuntimeSnapshot through compact SMT summary fields.

## Safety

SMT remains a confirmation filter only. It cannot create trades, approve Paper-Demo Candidate, override readiness, send go-trader handoffs, connect Tradovate, place orders, or enable live/demo/paper execution.
