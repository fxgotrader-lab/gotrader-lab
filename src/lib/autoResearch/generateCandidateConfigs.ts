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

export function generateCandidateConfigs(
  baseline: ResolvedBacktestConfig,
  searchMode: AutoResearchSearchMode,
  maxCandidateCount: number
): AutoResearchCandidateConfig[] {
  const candidates: AutoResearchCandidateConfig[] = [];

  if (searchMode === "conservative") {
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

  if (searchMode === "balanced") {
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
      )
    );
  }

  if (searchMode === "aggressive_research_only") {
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

  if (searchMode === "session_focused") {
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
      )
    );
  }

  if (searchMode === "stop_model_focused") {
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
      )
    );
  }

  if (searchMode === "long_short_bias") {
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

  return candidates.slice(0, Math.max(1, Math.min(12, maxCandidateCount)));
}
