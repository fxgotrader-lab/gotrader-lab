# Grinch Layered Research Framing

GoTrader treats ICT as the foundation and Grinch as the final operational refinement layer. Research metrics should measure how each added layer qualifies, blocks, or improves ICT setups. They should not frame Grinch as a separate strategy competing against ICT.

## Correct Model

1. ICT foundation candidates
2. PD array / liquidity alignment
3. Grinch profile classification
4. Timing gate
5. Entry confirmation
6. Evidence confirmation
7. Readiness / walk-forward / maturity

Useful terms:

- ICT foundation
- Grinch refinement layer
- ICT + Grinch full-stack setup
- Layer contribution
- Grinch-qualified ICT setup
- Grinch-blocked ICT setup
- Full-stack ICT/Grinch setup

Avoid competitor framing that treats ICT and Grinch as independent strategies competing for promotion.

## Layer Metrics

Auto Research should expose compact layer-contribution metrics:

- `ictFoundationCandidates`
- `grinchQualifiedCandidates`
- `grinchBlockedCandidates`
- `profileInvalidBlocks`
- `timingExpiredBlocks`
- `pdArrayInvalidBlocks`
- `entryConfirmationFailures`
- `fullStackSetups`
- `fullStackWinRate`
- `fullStackAverageR`
- `layerContributionSummary`

These metrics describe how the Grinch refinement layer filtered the ICT foundation. They do not grant readiness, broker authority, or execution permission.

## Benchmark Matrix

The benchmark matrix is progressive:

1. ICT foundation only
2. ICT + PD/liquidity alignment
3. ICT + Grinch profile
4. ICT + Grinch timing
5. ICT + Grinch entry confirmation
6. ICT + full Grinch stack

Each row is a layer-contribution view. Readiness still depends on trade count, average R, drawdown, walk-forward, evidence quality, maturity, and safety gates.

## Safety Boundary

The Grinch layer remains research-only. It cannot place trades, approve execution, bypass the Risk Manager, bypass readiness, or override broker gates.
