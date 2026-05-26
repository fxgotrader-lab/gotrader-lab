# Agent Debate Layer

GoTrader AI Lab now has a structured agent debate layer for research explainability. It is simulation-only and cannot execute trades, approve trades, modify broker settings, or override readiness gates.

## Purpose

The debate layer turns the existing independent agent opinions into a desk-style review:

1. Agents publish independent opening statements.
2. Two bounded debate rounds run.
3. Agents may challenge, support, concede, qualify, or add context.
4. Agents may update probability/confidence.
5. The moderator/CIO declares consensus or flat/no consensus.
6. Minority views and unresolved disagreements are preserved.

## Facts vs Interpretation

Deterministic facts remain immutable:

- ICT bias
- confluence score
- liquidity sweeps
- MSS/BOS status
- fair value gaps
- premium/discount state
- session and kill-zone tags
- CIO invalidation and target levels

The debate layer can only interpret those facts. It cannot rewrite them.

Future market data context is also treated as immutable input once an adapter snapshot is created. Session levels,
volume profile, macro context, intermarket readings, positioning/gamma, and order-flow imports can add evidence to
the debate, but debate agents still interpret context only.

Equity-style sector agents are deprecated in the main futures workflow. The debate desk now prioritizes futures market
context agents because index futures respond more directly to session liquidity, auction levels, macro events,
intermarket confirmation, positioning/gamma, and volatility regime than to broad equity-sector rotation summaries.

## Consensus Rules

Consensus requires a configurable alignment threshold. The default is three aligned agents.

If fewer than three agents align, or if long/short evidence is deadlocked, the moderator declares:

```text
flat / no tradeable research consensus
```

No consensus is not treated as failure. It means the research desk does not have enough aligned evidence to form a directional thesis.

## Debate Actions

Agents can produce these message types:

- `challenge`
- `support`
- `concede`
- `qualify`
- `add_context`

Each debate message includes referenced evidence, updated probability, conviction change, and safety notes.

## Moderator Output

The moderator records:

- consensus reached or not
- position: long, short, or flat
- probability
- agreement points
- disagreements
- invalidation
- minority view
- desk reasoning
- no-consensus reason when applicable

## LLM Role

The current debate runner is deterministic fallback. It is designed so a future local-command LLM provider can write debate rounds, while preserving the same safety boundary.

LLM debate agents may interpret research context only. They must return advisory-only responses and have:

- execution authority: none
- broker authority: none
- readiness override authority: none

## Safety

The debate layer cannot:

- place trades
- approve trades
- enable paper/demo/live trading
- change broker or risk settings
- override readiness gates
- bypass user approval

The output is research context only.
