import { sanitizeBacktestConfig } from "@/lib/backtesting";
import type {
  BacktestConfig,
  BacktestSessionFilter,
  BacktestStopModel,
  ResolvedBacktestConfig,
  TradeQualityDiagnostic
} from "@/lib/backtesting";
import type { AutoResearchCandidateConfig } from "@/lib/autoResearch/autoResearchTypes";
import { safeArray, uid } from "@/lib/utils";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const candidate = (
  baseline: ResolvedBacktestConfig,
  label: string,
  rationale: string,
  patch: BacktestConfig,
  changedParameters: string[]
): AutoResearchCandidateConfig => ({
  candidateId: uid("trade_quality_candidate"),
  label,
  searchMode: "standard",
  rationale,
  config: sanitizeBacktestConfig({ ...baseline, ...patch }),
  changedParameters
});

const patchKey = (patch: BacktestConfig) =>
  JSON.stringify({
    sessionFilter: patch.sessionFilter,
    stopModel: patch.stopModel,
    fixedTickStopSize: patch.fixedTickStopSize,
    targetRMultiple: patch.targetRMultiple,
    allowLong: patch.allowLong,
    allowShort: patch.allowShort,
    minimumConfidenceThreshold: patch.minimumConfidenceThreshold,
    minimumConfluenceThreshold: patch.minimumConfluenceThreshold
  });

const addUnique = (
  candidates: AutoResearchCandidateConfig[],
  baseline: ResolvedBacktestConfig,
  seen: Set<string>,
  label: string,
  rationale: string,
  patch: BacktestConfig,
  changedParameters: string[]
) => {
  const key = patchKey(patch);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  candidates.push(candidate(baseline, label, rationale, patch, changedParameters));
};

export function generateTradeQualityCandidateConfigs(
  baseline: ResolvedBacktestConfig,
  diagnostics: TradeQualityDiagnostic[],
  maxCandidateCount = 12
): AutoResearchCandidateConfig[] {
  const candidates: AutoResearchCandidateConfig[] = [];
  const seen = new Set<string>();
  const reasonCodes = new Set(safeArray(diagnostics).map((item) => item.reasonCode));
  const add = (
    label: string,
    rationale: string,
    patch: BacktestConfig,
    changedParameters: string[]
  ) => addUnique(candidates, baseline, seen, label, rationale, patch, changedParameters);
  const addNyAmWinRateFocus = () => {
    add(
      "NY AM 1R win-rate test",
      "Win rate was the top trade-quality issue and NY AM was recommended, so this tests the cleaner session with a closer 1R target.",
      { sessionFilter: "NY AM Kill Zone", targetRMultiple: 1 },
      ["sessionFilter", "targetRMultiple"]
    );
    add(
      "NY AM FVG invalidation test",
      "Win rate was weak, so this tests whether fair-value-gap invalidation improves NY AM trade quality.",
      { sessionFilter: "NY AM Kill Zone", stopModel: "FVG invalidation" },
      ["sessionFilter", "stopModel"]
    );
    add(
      "NY AM structure invalidation test",
      "Win rate was weak, so this tests structure-based invalidation inside the NY AM window.",
      { sessionFilter: "NY AM Kill Zone", stopModel: "latest swing" },
      ["sessionFilter", "stopModel"]
    );
    add(
      "NY AM long-only quality test",
      "Win rate was weak, so this isolates bullish theses during the NY AM window.",
      { sessionFilter: "NY AM Kill Zone", allowLong: true, allowShort: false },
      ["sessionFilter", "allowLong", "allowShort"]
    );
    add(
      "NY AM short-only quality test",
      "Win rate was weak, so this isolates bearish theses during the NY AM window.",
      { sessionFilter: "NY AM Kill Zone", allowLong: false, allowShort: true },
      ["sessionFilter", "allowLong", "allowShort"]
    );
  };

  const stopModels: Array<{ label: string; stopModel: BacktestStopModel; fixedTickStopSize?: number }> = [
    { label: "Fixed tick stop quality test", stopModel: "fixed ticks", fixedTickStopSize: Math.max(20, Math.min(60, baseline.fixedTickStopSize || 40)) },
    { label: "Latest swing stop quality test", stopModel: "latest swing" },
    { label: "FVG invalidation quality test", stopModel: "FVG invalidation" },
    { label: "Structure invalidation proxy", stopModel: "latest swing" }
  ];
  const targetTests = [
    { label: "1R target quality test", targetRMultiple: 1 },
    { label: "1.5R target quality test", targetRMultiple: 1.5 },
    { label: "2R target quality test", targetRMultiple: 2 },
    { label: "Nearby liquidity target proxy", targetRMultiple: 1.25 }
  ];
  const sessionTests: Array<{ label: string; sessionFilter: BacktestSessionFilter }> = [
    { label: "NY AM only quality test", sessionFilter: "NY AM Kill Zone" },
    { label: "London only quality test", sessionFilter: "London" },
    { label: "All sessions quality retest", sessionFilter: "all" },
    { label: "New York session quality test", sessionFilter: "New York" }
  ];

  if (reasonCodes.has("win_rate_too_low")) {
    addNyAmWinRateFocus();
  }

  if (reasonCodes.has("stop_model_weak") || reasonCodes.has("max_drawdown_too_high") || reasonCodes.has("average_r_too_low")) {
    for (const test of stopModels) {
      add(
        test.label,
        "Trade quality diagnostic requested stop-model comparison before any readiness promotion.",
        {
          stopModel: test.stopModel,
          fixedTickStopSize: test.fixedTickStopSize
        },
        test.fixedTickStopSize ? ["stopModel", "fixedTickStopSize"] : ["stopModel"]
      );
    }
  }

  if (reasonCodes.has("target_r_mismatch") || reasonCodes.has("average_r_too_low") || reasonCodes.has("too_many_low_r_trades")) {
    for (const test of targetTests) {
      add(
        test.label,
        "Trade quality diagnostic requested target-model comparison focused on average R and resolution quality.",
        { targetRMultiple: test.targetRMultiple },
        ["targetRMultiple"]
      );
    }
  }

  if (reasonCodes.has("session_filter_weak") || reasonCodes.has("win_rate_too_low") || reasonCodes.has("false_positive_cluster")) {
    for (const test of sessionTests) {
      add(
        test.label,
        "Trade quality diagnostic requested session isolation before keeping blended all-session behavior.",
        { sessionFilter: test.sessionFilter },
        ["sessionFilter"]
      );
    }
  }

  if (reasonCodes.has("long_short_bias_weak") || reasonCodes.has("win_rate_too_low")) {
    add("Long-only trade quality test", "Isolate bullish theses to check whether one side carries the losses.", { allowLong: true, allowShort: false }, ["allowLong", "allowShort"]);
    add("Short-only trade quality test", "Isolate bearish theses to check whether one side carries the losses.", { allowLong: false, allowShort: true }, ["allowLong", "allowShort"]);
    add("Both directions retest", "Retest both directions after quality filters so side isolation is not overfit.", { allowLong: true, allowShort: true }, ["allowLong", "allowShort"]);
  }

  if (
    reasonCodes.has("win_rate_too_low") ||
    reasonCodes.has("false_positive_cluster") ||
    reasonCodes.has("conservative_scenario_unstable") ||
    reasonCodes.has("max_drawdown_too_high")
  ) {
    add(
      "Higher confidence quality filter",
      "Reject weaker CIO theses while keeping confluence unchanged.",
      { minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.07), 2) },
      ["confidenceThreshold"]
    );
    add(
      "Higher confluence quality filter",
      "Reject weaker ICT setups while preserving current confidence gate.",
      { minimumConfluenceThreshold: round(clamp01(baseline.minimumConfluenceThreshold + 0.06), 2) },
      ["confluenceThreshold"]
    );
    add(
      "Low-R setup rejection proxy",
      "Combine a modest confidence lift with a realistic target to avoid low-R churn.",
      {
        minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.04), 2),
        targetRMultiple: Math.max(1.25, Math.min(2, baseline.targetRMultiple))
      },
      ["confidenceThreshold", "targetRMultiple"]
    );
  }

  if (reasonCodes.has("false_positive_cluster")) {
    add(
      "Grinch Phase 1 HTF alignment gate",
      "False positives were elevated, so require stronger higher-timeframe bias and PD hierarchy agreement before accepting a research thesis.",
      {
        minimumConfluenceThreshold: round(clamp01(Math.max(0.5, baseline.minimumConfluenceThreshold + 0.08)), 2),
        agentWeights: {
          ...baseline.agentWeights,
          "grinch-htf-bias-agent": round(Math.min(1.5, baseline.agentWeights["grinch-htf-bias-agent"] + 0.05), 3),
          "grinch-pd-array-hierarchy-agent": round(Math.min(1.5, baseline.agentWeights["grinch-pd-array-hierarchy-agent"] + 0.05), 3)
        }
      },
      ["confluenceThreshold", "agentWeights"]
    );
    add(
      "Grinch opening-price alignment gate",
      "False positives can come from ignoring Sunday Open and 12AM Open; this emphasizes opening-price equilibrium and time-price alignment.",
      {
        minimumConfidenceThreshold: round(clamp01(Math.max(0.5, baseline.minimumConfidenceThreshold + 0.06)), 2),
        agentWeights: {
          ...baseline.agentWeights,
          "grinch-opening-price-equilibrium-agent": round(Math.min(1.5, baseline.agentWeights["grinch-opening-price-equilibrium-agent"] + 0.05), 3),
          "grinch-time-price-alignment-agent": round(Math.min(1.5, baseline.agentWeights["grinch-time-price-alignment-agent"] + 0.04), 3)
        }
      },
      ["confidenceThreshold", "agentWeights"]
    );
    add(
      "Grinch Model 1 confirmation gate",
      "False positives were elevated, so this requires cleaner Model 1 classification and entry-confirmation evidence.",
      {
        minimumConfluenceThreshold: round(clamp01(Math.max(0.52, baseline.minimumConfluenceThreshold + 0.1)), 2),
        minimumConfidenceThreshold: round(clamp01(Math.max(0.52, baseline.minimumConfidenceThreshold + 0.08)), 2),
        agentWeights: {
          ...baseline.agentWeights,
          "grinch-model-one-power-three-agent": round(Math.min(1.5, baseline.agentWeights["grinch-model-one-power-three-agent"] + 0.06), 3),
          "grinch-entry-confirmation-agent": round(Math.min(1.5, baseline.agentWeights["grinch-entry-confirmation-agent"] + 0.06), 3)
        }
      },
      ["confluenceThreshold", "confidenceThreshold", "agentWeights"]
    );
  }

  if (reasonCodes.has("sample_size_too_low")) {
    add(
      "Sample size all-session retest",
      "Check whether sample size improves without degrading quality.",
      { sessionFilter: "all" },
      ["sessionFilter"]
    );
    add(
      "Balanced sample threshold retest",
      "Slightly widen filters for research-only sample building without touching execution settings.",
      {
        minimumConfluenceThreshold: round(Math.max(0.35, baseline.minimumConfluenceThreshold - 0.03), 2),
        minimumConfidenceThreshold: round(Math.max(0.35, baseline.minimumConfidenceThreshold - 0.02), 2)
      },
      ["confluenceThreshold", "confidenceThreshold"]
    );
  }

  if (!candidates.length) {
    add(
      "Balanced trade quality retest",
      "Default quality retest when diagnostics are informational only.",
      {
        minimumConfidenceThreshold: round(clamp01(baseline.minimumConfidenceThreshold + 0.04), 2),
        targetRMultiple: Math.max(1.25, Math.min(2, baseline.targetRMultiple))
      },
      ["confidenceThreshold", "targetRMultiple"]
    );
  }

  return candidates.slice(0, Math.max(1, Math.min(20, maxCandidateCount)));
}
