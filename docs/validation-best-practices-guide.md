# Validation Best Practices Guide

GoTrader AI Lab validation is a simulation/backtesting workflow. It does not connect to brokers, place orders, use API keys, stream live market data, or execute trades.

Safety rule:

`Simulation validation only. Do not connect broker execution until the system repeatedly reaches Paper-Demo Candidate under conservative settings.`

## Step-by-Step Workflow

1. Start with default parameters.
2. Run a baseline backtest.
3. Save or record baseline results.
4. Run a conservative scenario.
5. Run an aggressive scenario.
6. Test NY AM only.
7. Test London only.
8. Test long-only.
9. Test short-only.
10. Test stop models: latest swing, fixed ticks, and FVG invalidation.
11. Run the validation suite.
12. Run research quality review.
13. Compare results.
14. Identify weak conditions.
15. Adjust only one variable at a time.
16. Re-run validation.
17. Avoid overfitting.
18. Require consistency before moving forward.
19. Mark readiness: Not Ready, Research Ready, or Paper-Demo Candidate.
20. Stop if results are unstable.

## Best Practices

- Do not chase highest profit.
- Prefer stable average R over one big win.
- Watch max drawdown carefully.
- Watch skipped signals.
- Watch false positives.
- Watch confidence calibration.
- Compare sessions separately.
- Compare long and short separately.
- Change one parameter at a time.
- Keep conservative settings as the main benchmark.
- Do not move to paper/demo unless results are repeatable.

## Recommended Weekly Validation Routine

Day 1: baseline + conservative test

Day 2: session comparison

Day 3: long/short comparison

Day 4: stop-model comparison

Day 5: research quality review

Day 6: parameter adjustment

Day 7: no changes; review notes only

## Minimum Paper-Demo Readiness Checklist

- Research Quality = Paper-Demo Candidate
- Conservative validation is stable
- No major drawdown cluster
- False positives are understood
- Best session is clearly identified
- Stop model is selected
- Confluence threshold is selected
- Confidence threshold is selected
- AI Lab to go-trader simulation runbook passed
- Broker execution still disabled

## How To Interpret Results

Use conservative validation as the main benchmark. Aggressive settings can reveal opportunity density, but they should not become the default just because they produce more trades or a larger single win.

Average R matters more than one large outcome. A strategy that relies on one oversized simulated winner is not stable enough for paper-demo planning.

Max drawdown and false positives should be treated as blockers. A small profit with clustered losses can be worse than a flat result with clean risk behavior.

Confidence calibration matters because the CIO score is meant to communicate reliability. If stated confidence is far above realized hit rate, the strategy is still research-only.

## When To Stop

Stop validation changes when results become unstable, when one variable change causes large swings in readiness, or when the best result only appears after many attempts. That pattern is usually overfitting.

The correct next step after instability is notes and review, not more parameter hunting.
