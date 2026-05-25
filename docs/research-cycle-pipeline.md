# AI Research Cycle Pipeline

The dashboard **Run AI Research Cycle** control runs a local, simulation-only research pipeline. It automates research evidence gathering, but it never places orders, connects to a broker, enables paper/demo/live mode, or overrides readiness gates.

## Pipeline Order

1. Generate or refresh the research thesis.
   - Uses the active Backtest Lab symbol, timeframe, session filter, and market regime.
   - Builds deterministic ICT context.
   - Produces a CIO thesis with bias, confidence, invalidation, target, and risk notes.
   - Saves the thesis into local AI Lab memory.

2. Run the mock-data backtest.
   - Uses active/default Backtest Lab config.
   - Stores a compact summary only: trades, win rate, average R, max drawdown, skipped signals, best/worst R.
   - If this step fails, candidate scoring stops because downstream optimization would not be trustworthy.

3. Run LLM advisory review.
   - Uses the local LLM bridge if available.
   - If unavailable, the step records a warning and the pipeline continues through deterministic simulation checks.
   - Missing LLM review is never marked as passed.

4. Run multi-pass Auto Research.
   - Quick, standard, and deep modes control candidate count.
   - Candidate configs are bounded to research settings only.
   - Ranking favors stability over profit.
   - Any created calibration proposal remains approval-required.

5. Run Validation Suite.
   - Stores strongest/weakest scenarios and recommended thresholds.
   - Uses mock OHLC data only.

6. Run Research Quality Review.
   - Produces readiness grade, top weaknesses, top strengths, and next action.

7. Run Self-Improvement Evaluation.
   - Checks whether Auto Research created or found a proposal.
   - Does not apply settings automatically.

8. Update Simulation Runbook.
   - Marks the research pipeline timestamp and AI Lab thesis generation.
   - Does not mark scheduler one-cycle, signal logged, broker skipped, positions zero, trades zero, or shutdown complete unless those were already manually verified.

9. Update Readiness Gate.
   - Calculates Not Ready, Research Ready, or Paper-Demo Candidate.
   - LLM advisory missing keeps Paper-Demo Candidate blocked.
   - No readiness override is applied.

10. Produce Final Cycle Result.
   - Final status is `completed`, `completed_with_warnings`, or `failed`.
   - Includes readiness, blockers, best candidate, proposal status, and next action.

## What Is Automated

- Thesis generation
- Mock-data backtest
- Local LLM bridge attempt
- Auto Research candidate search
- Validation suite
- Research quality review
- Proposal creation when stability improves
- Runbook research timestamp
- Readiness recalculation
- Communications audit entry

## What Still Requires Approval

- Calibration proposal acceptance
- Any active setting change
- Any future paper-demo bridge decision
- Any readiness blocker acknowledgement

## Safety Boundary

The pipeline cannot:

- Execute trades
- Connect to brokers
- Enable demo/live mode
- Modify API keys
- Change broker risk settings
- Approve its own proposals
- Override readiness gates

## Final Readiness Results

- **Not Ready**: Research evidence is incomplete or unstable. Continue simulation work.
- **Research Ready**: Deterministic validation may be usable for continued research, but Paper-Demo Candidate remains blocked until all required checks pass.
- **Paper-Demo Candidate**: All required checks pass, including LLM advisory review. This is still not permission to execute trades; it only means the research package can be reviewed for a future paper-demo architecture.
