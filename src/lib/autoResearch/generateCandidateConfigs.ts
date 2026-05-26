import { sanitizeBacktestConfig } from "@/lib/backtesting";
import type { BacktestAgentWeightId, ResolvedBacktestConfig } from "@/lib/backtesting";
import type {
  AutoResearchCandidateConfig,
  AutoResearchFailedGate,
  AutoResearchSafeConfigPatch,
  AutoResearchSearchMode
} from "@/lib/autoResearch/autoResearchTypes";
import { uid } from "@/lib/utils";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const candidate = (
  baseline: ResolvedBacktestConfig,
  searchMode: AutoResearchSearchMode,
  label: string,
  rationale: string,
  patch: AutoResearchSafeConfigPatch,
  changedParameters: string[]
): AutoResearchCandidateConfig => {
  const { ictScoringWeights, ...configPatch } = patch;
  return {
    candidateId: uid("auto_candidate"),
    label,
    searchMode,
    rationale,
    config: sanitizeBacktestConfig({ ...baseline, ...configPatch }),
    ictScoringWeights,
    changedParameters
  };
};

const nudgeAgent = (
  baseline: ResolvedBacktestConfig,
  agentId: BacktestAgentWeightId,
  delta: number
) => ({
  ...baseline.agentWeights,
  [agentId]: round(Math.min(1.5, Math.max(0.05, baseline.agentWeights[agentId] + delta)), 3)
});

const isAnyMode = (searchMode: AutoResearchSearchMode, modes: AutoResearchSearchMode[]) => modes.includes(searchMode);

const dedupeCandidates = (candidates: AutoResearchCandidateConfig[]) => {
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const fingerprint = JSON.stringify({
      config: item.config,
      ictScoringWeights: item.ictScoringWeights ?? {}
    });
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
};

export function generateCandidateConfigs(
  baseline: ResolvedBacktestConfig,
  searchMode: AutoResearchSearchMode,
  maxCandidateCount: number
): AutoResearchCandidateConfig[] {
  const candidates: AutoResearchCandidateConfig[] = [];

  if (isAnyMode(searchMode, ["conservative", "conservative_only", "quick", "standard", "deep"])) {
    candidates.push(
      candidate(
        baseline,
        searchMode,
        "Stricter evidence gate",
        "Raise confluence and confidence together to reduce fragile theses.",
        {
          minimumConfluenceThreshold: round(clamp01(baseline.minimumConfluenceThreshold + 0.08), 2),
          minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.06), 2)
        },
        ["confluenceThreshold", "confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "NY AM conservative filter",
        "Limit decisions to a common ICT kill-zone while keeping strict thresholds.",
        {
          sessionFilter: "NY AM Kill Zone",
          minimumConfluenceThreshold: Math.max(0.5, baseline.minimumConfluenceThreshold),
          minimumConfidenceThreshold: Math.max(0.5, baseline.minimumConfidenceThreshold)
        },
        ["sessionFilter", "confluenceThreshold", "confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "ICT stability weight nudge",
        "Slightly emphasize risk/reward and liquidity evidence in ICT confluence scoring.",
        {
          ictScoringWeights: {
            riskRewardQuality: 1,
            liquiditySweep: 1.1
          }
        },
        ["ictScoringWeights"]
      )
    );
  }

  if (isAnyMode(searchMode, ["balanced", "quick", "standard", "deep"])) {
    candidates.push(
      candidate(
        baseline,
        searchMode,
        "Balanced threshold nudge",
        "Moderately increase confluence while preserving trade count.",
        {
          minimumConfluenceThreshold: round(clamp01(baseline.minimumConfluenceThreshold + 0.04), 2)
        },
        ["confluenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "Risk/reward balance",
        "Test a slightly cleaner target assumption without changing execution authority.",
        {
          targetRMultiple: round(Math.min(3, Math.max(1.5, baseline.targetRMultiple + 0.25)), 2)
        },
        ["targetRMultiple"]
      ),
      candidate(
        baseline,
        searchMode,
        "Confidence calibration nudge",
        "Raise confidence threshold without changing the ICT threshold.",
        {
          minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.05), 2)
        },
        ["confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "Tighter confluence, lower target",
        "Test whether a smaller target improves resolution quality under stricter confluence.",
        {
          minimumConfluenceThreshold: round(clamp01(baseline.minimumConfluenceThreshold + 0.06), 2),
          targetRMultiple: round(Math.max(1.25, baseline.targetRMultiple - 0.25), 2)
        },
        ["confluenceThreshold", "targetRMultiple"]
      )
    );
  }

  if (isAnyMode(searchMode, ["aggressive_research_only", "deep"])) {
    candidates.push(
      candidate(
        baseline,
        searchMode,
        "Lower threshold exploration",
        "Research-only exploration to see if more signals stay stable.",
        {
          minimumConfluenceThreshold: round(Math.max(0.15, baseline.minimumConfluenceThreshold - 0.08), 2),
          minimumConfidenceThreshold: round(Math.max(0.3, baseline.minimumConfidenceThreshold - 0.04), 2)
        },
        ["confluenceThreshold", "confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "More frequent decisions",
        "Research-only check for opportunity sensitivity with a shorter decision interval.",
        {
          decisionInterval: Math.max(1, baseline.decisionInterval - 1)
        },
        ["decisionInterval"]
      )
    );
  }

  if (isAnyMode(searchMode, ["session_focused", "session_focus", "standard", "deep"])) {
    candidates.push(
      candidate(
        baseline,
        searchMode,
        "NY AM only",
        "Test whether the strongest session slice improves stability.",
        { sessionFilter: "NY AM Kill Zone" },
        ["sessionFilter"]
      ),
      candidate(
        baseline,
        searchMode,
        "London only",
        "Compare London-only behavior against the baseline.",
        { sessionFilter: "London" },
        ["sessionFilter"]
      ),
      candidate(
        baseline,
        searchMode,
        "New York session",
        "Compare broader New York context against kill-zone-only behavior.",
        { sessionFilter: "New York" },
        ["sessionFilter"]
      ),
      candidate(
        baseline,
        searchMode,
        "London strict threshold",
        "Compare London only with stricter evidence requirements.",
        {
          sessionFilter: "London",
          minimumConfluenceThreshold: Math.max(0.5, baseline.minimumConfluenceThreshold),
          minimumConfidenceThreshold: Math.max(0.5, baseline.minimumConfidenceThreshold)
        },
        ["sessionFilter", "confluenceThreshold", "confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "New York PM strict filter",
        "Test whether the PM kill-zone stays stable under stricter filters.",
        {
          sessionFilter: "NY PM Kill Zone",
          minimumConfluenceThreshold: Math.max(0.5, baseline.minimumConfluenceThreshold),
          minimumConfidenceThreshold: Math.max(0.5, baseline.minimumConfidenceThreshold)
        },
        ["sessionFilter", "confluenceThreshold", "confidenceThreshold"]
      )
    );
  }

  if (isAnyMode(searchMode, ["stop_model_focused", "stop_model_focus", "standard", "deep"])) {
    candidates.push(
      candidate(baseline, searchMode, "Latest swing stop", "Retest structure-based invalidation.", { stopModel: "latest swing" }, ["stopModel"]),
      candidate(
        baseline,
        searchMode,
        "FVG invalidation stop",
        "Retest fair-value-gap invalidation boundaries.",
        { stopModel: "FVG invalidation" },
        ["stopModel"]
      ),
      candidate(
        baseline,
        searchMode,
        "Fixed tick stop",
        "Retest fixed tick stop assumptions with bounded risk.",
        { stopModel: "fixed ticks", fixedTickStopSize: 40 },
        ["stopModel", "fixedTickStopSize"]
      ),
      candidate(
        baseline,
        searchMode,
        "Wider fixed tick stop",
        "Check whether a wider fixed stop reduces premature stop-outs without bloating drawdown.",
        { stopModel: "fixed ticks", fixedTickStopSize: Math.min(120, baseline.fixedTickStopSize + 16) },
        ["stopModel", "fixedTickStopSize"]
      ),
      candidate(
        baseline,
        searchMode,
        "Tighter fixed tick stop",
        "Check whether a tighter fixed stop reduces adverse excursion without killing sample size.",
        { stopModel: "fixed ticks", fixedTickStopSize: Math.max(12, baseline.fixedTickStopSize - 12) },
        ["stopModel", "fixedTickStopSize"]
      )
    );
  }

  if (isAnyMode(searchMode, ["long_short_bias", "long_short_focus", "standard", "deep"])) {
    candidates.push(
      candidate(
        baseline,
        searchMode,
        "Long-only bias check",
        "Isolate bullish thesis performance without allowing short theses.",
        { allowLong: true, allowShort: false },
        ["allowLong", "allowShort"]
      ),
      candidate(
        baseline,
        searchMode,
        "Short-only bias check",
        "Isolate bearish thesis performance without allowing long theses.",
        { allowLong: false, allowShort: true },
        ["allowLong", "allowShort"]
      ),
      candidate(
        baseline,
        searchMode,
        "Structure agent weight nudge",
        "Small grouped agent-weight change for CIO synthesis sensitivity.",
        {
          agentWeights: {
            ...nudgeAgent(baseline, "ict-structure-agent", 0.04),
            "volatility-regime-agent": round(Math.max(0.05, baseline.agentWeights["volatility-regime-agent"] - 0.04), 3)
          }
        },
        ["agentWeights"]
      ),
      candidate(
        baseline,
        searchMode,
        "Liquidity agent weight nudge",
        "Small grouped agent-weight change to test whether liquidity evidence improves CIO stability.",
        {
          agentWeights: {
            ...nudgeAgent(baseline, "ict-liquidity-agent", 0.04),
            "risk-reward-agent": round(Math.max(0.05, baseline.agentWeights["risk-reward-agent"] - 0.04), 3)
          }
        },
        ["agentWeights"]
      )
    );
  }

  if (isAnyMode(searchMode, ["deep"])) {
    candidates.push(
      candidate(
        baseline,
        searchMode,
        "High confluence high confidence",
        "Stress-test the strictest practical evidence combination.",
        { minimumConfluenceThreshold: 0.65, minimumConfidenceThreshold: 0.68 },
        ["confluenceThreshold", "confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "Moderate confluence high confidence",
        "Test whether confidence filtering is more useful than aggressive confluence.",
        { minimumConfluenceThreshold: 0.45, minimumConfidenceThreshold: 0.68 },
        ["confluenceThreshold", "confidenceThreshold"]
      ),
      candidate(
        baseline,
        searchMode,
        "NY AM swing stop",
        "Combine session quality with structure-based invalidation.",
        { sessionFilter: "NY AM Kill Zone", stopModel: "latest swing" },
        ["sessionFilter", "stopModel"]
      ),
      candidate(
        baseline,
        searchMode,
        "NY AM FVG stop",
        "Combine session quality with fair-value-gap invalidation.",
        { sessionFilter: "NY AM Kill Zone", stopModel: "FVG invalidation" },
        ["sessionFilter", "stopModel"]
      ),
      candidate(
        baseline,
        searchMode,
        "London FVG stop",
        "Test whether London entries need FVG-based invalidation.",
        { sessionFilter: "London", stopModel: "FVG invalidation" },
        ["sessionFilter", "stopModel"]
      ),
      candidate(
        baseline,
        searchMode,
        "Higher target quality",
        "Check if better reward target improves average R without sacrificing stability.",
        { targetRMultiple: Math.min(3.5, baseline.targetRMultiple + 0.5) },
        ["targetRMultiple"]
      ),
      candidate(
        baseline,
        searchMode,
        "Lower target stability",
        "Check if a more conservative target improves win rate and drawdown.",
        { targetRMultiple: Math.max(1.25, baseline.targetRMultiple - 0.5) },
        ["targetRMultiple"]
      ),
      candidate(
        baseline,
        searchMode,
        "FVG scoring emphasis",
        "Emphasize FVG alignment in ICT scoring without changing execution authority.",
        {
          ictScoringWeights: {
            fvgAlignment: 1.15,
            premiumDiscountAlignment: 1.05
          }
        },
        ["ictScoringWeights"]
      ),
      candidate(
        baseline,
        searchMode,
        "Session scoring emphasis",
        "Emphasize kill-zone timing and swing structure in ICT scoring.",
        {
          ictScoringWeights: {
            sessionKillZone: 1.15,
            latestSwingStructure: 1.1
          }
        },
        ["ictScoringWeights"]
      ),
      candidate(
        baseline,
        searchMode,
        "Risk reward agent emphasis",
        "Increase risk/reward influence while slightly reducing volatility influence.",
        {
          agentWeights: {
            ...nudgeAgent(baseline, "risk-reward-agent", 0.05),
            "volatility-regime-agent": round(Math.max(0.05, baseline.agentWeights["volatility-regime-agent"] - 0.05), 3)
          }
        },
        ["agentWeights"]
      )
    );
  }

  if (!candidates.length) {
    candidates.push(
      candidate(
        baseline,
        "balanced",
        "Default balanced nudge",
        "Fallback candidate if no search mode matched.",
        { minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.04), 2) },
        ["confidenceThreshold"]
      )
    );
  }

  return dedupeCandidates(candidates).slice(0, Math.max(1, Math.min(25, maxCandidateCount)));
}

const pushAdaptiveCandidate = (
  candidates: AutoResearchCandidateConfig[],
  baseline: ResolvedBacktestConfig,
  label: string,
  rationale: string,
  patch: AutoResearchSafeConfigPatch,
  changedParameters: string[]
) => {
  candidates.push(candidate(baseline, "standard", label, rationale, patch, changedParameters));
};

export function generateAdaptiveCandidateConfigs({
  baseline,
  failedGates,
  passNumber,
  maxCandidateCount
}: {
  baseline: ResolvedBacktestConfig;
  failedGates: AutoResearchFailedGate[];
  passNumber: number;
  maxCandidateCount: number;
}): AutoResearchCandidateConfig[] {
  const candidates: AutoResearchCandidateConfig[] = [];
  const gateSet = new Set(failedGates);
  const stricterConfluence = round(clamp01(baseline.minimumConfluenceThreshold + (passNumber === 1 ? 0.06 : 0.1)), 2);
  const stricterConfidence = round(clamp01(baseline.minimumConfidenceThreshold + (passNumber === 1 ? 0.05 : 0.08)), 2);
  const looserConfluence = round(Math.max(0.18, baseline.minimumConfluenceThreshold - 0.04), 2);
  const looserConfidence = round(Math.max(0.3, baseline.minimumConfidenceThreshold - 0.03), 2);

  if (gateSet.has("max_drawdown_too_high")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive drawdown guard",
      "Drawdown was too high, so this pass requires stronger confluence and confidence before a thesis can count.",
      { minimumConfluenceThreshold: stricterConfluence, minimumConfidenceThreshold: stricterConfidence },
      ["confluenceThreshold", "confidenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive structure stop",
      "Drawdown was too high, so this pass tests latest-swing invalidation without changing execution authority.",
      { stopModel: "latest swing" },
      ["stopModel"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive FVG invalidation",
      "Drawdown was too high, so this pass tests FVG invalidation boundaries.",
      { stopModel: "FVG invalidation" },
      ["stopModel"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive NY AM risk filter",
      "Drawdown was too high, so this pass restricts research to the highest-quality NY AM window.",
      { sessionFilter: "NY AM Kill Zone", minimumConfluenceThreshold: Math.max(0.5, baseline.minimumConfluenceThreshold) },
      ["sessionFilter", "confluenceThreshold"]
    );
  }

  if (gateSet.has("false_positives_too_high")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive false-positive filter",
      "False positives were too high, so this pass raises confluence without broadening the search.",
      { minimumConfluenceThreshold: stricterConfluence },
      ["confluenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive confidence filter",
      "False positives were too high, so this pass raises minimum confidence.",
      { minimumConfidenceThreshold: stricterConfidence },
      ["confidenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive NY AM false-positive check",
      "False positives were too high, so this pass removes weaker session exposure.",
      { sessionFilter: "NY AM Kill Zone" },
      ["sessionFilter"]
    );
  }

  if (gateSet.has("average_r_too_low")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive target lift",
      "Average R was weak, so this pass tests a modestly higher target.",
      { targetRMultiple: round(Math.min(3.25, baseline.targetRMultiple + 0.25), 2) },
      ["targetRMultiple"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive target stability",
      "Average R was weak, so this pass tests whether a smaller target improves resolution quality.",
      { targetRMultiple: round(Math.max(1.25, baseline.targetRMultiple - 0.25), 2) },
      ["targetRMultiple"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive low-R session cut",
      "Average R was weak, so this pass restricts the test to NY AM.",
      { sessionFilter: "NY AM Kill Zone" },
      ["sessionFilter"]
    );
  }

  if (gateSet.has("win_rate_too_low")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive long-only win-rate check",
      "Win rate was weak, so this pass isolates bullish thesis behavior.",
      { allowLong: true, allowShort: false },
      ["allowLong", "allowShort"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive short-only win-rate check",
      "Win rate was weak, so this pass isolates bearish thesis behavior.",
      { allowLong: false, allowShort: true },
      ["allowLong", "allowShort"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive win-rate confidence gate",
      "Win rate was weak, so this pass requires higher confidence.",
      { minimumConfidenceThreshold: stricterConfidence },
      ["confidenceThreshold"]
    );
  }

  if (
    gateSet.has("average_r_too_low") &&
    gateSet.has("win_rate_too_low") &&
    !gateSet.has("max_drawdown_too_high")
  ) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive balanced quality recovery",
      "Drawdown improved but trade quality collapsed, so this keeps the lower-risk posture while slightly loosening confluence and confidence.",
      { minimumConfluenceThreshold: looserConfluence, minimumConfidenceThreshold: looserConfidence },
      ["confluenceThreshold", "confidenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive session quality recovery",
      "Drawdown improved but win rate and average R weakened, so this tests whether a cleaner session restores trade quality.",
      { sessionFilter: "London", minimumConfluenceThreshold: looserConfluence },
      ["sessionFilter", "confluenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive stop-target quality recovery",
      "Drawdown improved but average R weakened, so this tests stop and target balance without changing execution authority.",
      { stopModel: "latest swing", targetRMultiple: round(Math.max(1.25, baseline.targetRMultiple - 0.25), 2) },
      ["stopModel", "targetRMultiple"]
    );
  }

  if (gateSet.has("trade_count_too_low")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive sample-size relief",
      "Trade count was too low, so this pass slightly lowers thresholds while staying simulation-only.",
      { minimumConfluenceThreshold: looserConfluence, minimumConfidenceThreshold: looserConfidence },
      ["confluenceThreshold", "confidenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive wider session sample",
      "Trade count was too low, so this pass widens the session filter.",
      { sessionFilter: "all", allowLong: true, allowShort: true },
      ["sessionFilter", "allowLong", "allowShort"]
    );
  }

  if (gateSet.has("confidence_calibration_weak")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive confidence penalty",
      "Confidence calibration was weak, so this pass raises minimum confidence.",
      { minimumConfidenceThreshold: stricterConfidence },
      ["confidenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive evidence confirmation",
      "Confidence calibration was weak, so this pass raises both evidence thresholds.",
      { minimumConfluenceThreshold: stricterConfluence, minimumConfidenceThreshold: stricterConfidence },
      ["confluenceThreshold", "confidenceThreshold"]
    );
  }

  if (gateSet.has("session_consistency_weak")) {
    pushAdaptiveCandidate(candidates, baseline, "Adaptive NY AM consistency", "Session consistency was weak, so this pass isolates NY AM.", { sessionFilter: "NY AM Kill Zone" }, ["sessionFilter"]);
    pushAdaptiveCandidate(candidates, baseline, "Adaptive London consistency", "Session consistency was weak, so this pass isolates London.", { sessionFilter: "London" }, ["sessionFilter"]);
    pushAdaptiveCandidate(candidates, baseline, "Adaptive New York consistency", "Session consistency was weak, so this pass isolates New York.", { sessionFilter: "New York" }, ["sessionFilter"]);
  }

  if (gateSet.has("conservative_scenario_unstable")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive conservative-only gate",
      "The conservative scenario was unstable, so this pass uses stricter evidence and structure-based invalidation.",
      { minimumConfluenceThreshold: Math.max(0.58, stricterConfluence), minimumConfidenceThreshold: Math.max(0.58, stricterConfidence), stopModel: "latest swing" },
      ["confluenceThreshold", "confidenceThreshold", "stopModel"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive conservative NY AM",
      "The conservative scenario was unstable, so this pass tests only NY AM under strict thresholds.",
      { sessionFilter: "NY AM Kill Zone", minimumConfluenceThreshold: Math.max(0.58, stricterConfluence), minimumConfidenceThreshold: Math.max(0.58, stricterConfidence) },
      ["sessionFilter", "confluenceThreshold", "confidenceThreshold"]
    );
  }

  if (gateSet.has("skipped_signal_imbalance")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive skipped-signal balance",
      "Skipped signals were imbalanced, so this pass slightly relaxes the evidence gate.",
      { minimumConfluenceThreshold: looserConfluence },
      ["confluenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive confidence balance",
      "Skipped signals were imbalanced, so this pass slightly relaxes confidence only.",
      { minimumConfidenceThreshold: looserConfidence },
      ["confidenceThreshold"]
    );
  }

  if (gateSet.has("overfitting_risk")) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive simple confidence nudge",
      "Overfitting risk was detected, so this pass tries a single-variable confidence nudge.",
      { minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.03), 2) },
      ["confidenceThreshold"]
    );
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive simple target trim",
      "Overfitting risk was detected, so this pass trims target ambition without changing other settings.",
      { targetRMultiple: round(Math.max(1.25, baseline.targetRMultiple - 0.25), 2) },
      ["targetRMultiple"]
    );
  }

  if (!candidates.length) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Adaptive conservative fallback",
      "No specific failed gate was available, so this pass tries one conservative evidence nudge.",
      { minimumConfluenceThreshold: stricterConfluence },
      ["confluenceThreshold"]
    );
  }

  return dedupeCandidates(candidates).slice(0, Math.max(1, Math.min(10, maxCandidateCount)));
}

export function generateTradeRecoveryCandidateConfigs(
  baseline: ResolvedBacktestConfig,
  maxCandidateCount = 8,
  options: { suggestedConfluenceThreshold?: number } = {}
): AutoResearchCandidateConfig[] {
  const candidates: AutoResearchCandidateConfig[] = [];
  const lowerConfluence = round(Math.max(0.12, baseline.minimumConfluenceThreshold - 0.08), 2);
  const lowerConfidence = round(Math.max(0.25, baseline.minimumConfidenceThreshold - 0.06), 2);
  const diagnosticConfluence = typeof options.suggestedConfluenceThreshold === "number"
    ? round(Math.min(baseline.minimumConfluenceThreshold - 0.01, Math.max(0.4, options.suggestedConfluenceThreshold)), 2)
    : undefined;

  if (diagnosticConfluence !== undefined && diagnosticConfluence < baseline.minimumConfluenceThreshold) {
    pushAdaptiveCandidate(
      candidates,
      baseline,
      "Recovery observed-confluence unlock",
      "Zero trades were generated, so this recovery tests the diagnostic threshold below the observed ICT confluence.",
      { minimumConfluenceThreshold: diagnosticConfluence },
      ["confluenceThreshold"]
    );
  }

  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery lower evidence gates",
    "Zero trades were generated, so this bounded recovery slightly lowers confluence and confidence.",
    {
      minimumConfluenceThreshold: lowerConfluence,
      minimumConfidenceThreshold: lowerConfidence
    },
    ["confluenceThreshold", "confidenceThreshold"]
  );
  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery all-session scan",
    "Zero trades were generated, so this recovery widens the session filter to all mock-data sessions.",
    { sessionFilter: "all" },
    ["sessionFilter"]
  );
  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery both directions",
    "Zero trades were generated, so this recovery allows both bullish and bearish simulated theses.",
    { allowLong: true, allowShort: true },
    ["allowLong", "allowShort"]
  );
  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery latest-swing stop",
    "Zero trades were generated, so this recovery tests structure-based invalidation.",
    { stopModel: "latest swing" },
    ["stopModel"]
  );
  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery FVG invalidation",
    "Zero trades were generated, so this recovery tests FVG invalidation.",
    { stopModel: "FVG invalidation" },
    ["stopModel"]
  );
  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery longer resolution",
    "Zero trades were generated, so this recovery extends the max bars to resolve a simulated outcome.",
    {
      maxBarsToResolveTrade: Math.min(48, Math.max(12, baseline.maxBarsToResolveTrade + 6)),
      lookaheadCandles: Math.min(48, Math.max(12, baseline.maxBarsToResolveTrade + 6))
    },
    ["maxBarsToResolveTrade"]
  );
  pushAdaptiveCandidate(
    candidates,
    baseline,
    "Recovery combined sample unlock",
    "Zero trades were generated, so this recovery combines small threshold relief with all sessions and both directions.",
    {
      minimumConfluenceThreshold: lowerConfluence,
      minimumConfidenceThreshold: lowerConfidence,
      sessionFilter: "all",
      allowLong: true,
      allowShort: true
    },
    ["confluenceThreshold", "confidenceThreshold", "sessionFilter", "allowLong", "allowShort"]
  );

  return dedupeCandidates(candidates).slice(0, Math.max(1, Math.min(8, maxCandidateCount)));
}
