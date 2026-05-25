import { sanitizeBacktestConfig } from "@/lib/backtesting";
import type { BacktestAgentWeightId, ResolvedBacktestConfig } from "@/lib/backtesting";
import type {
  AutoResearchCandidateConfig,
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
