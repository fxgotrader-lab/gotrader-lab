import { safeArray, uid } from "@/lib/utils";
import type {
  WalkForwardFailureDiagnostics,
  WalkForwardFollowUpRecommendation,
  WalkForwardFollowUpSearchPlan,
  WalkForwardLikelyFailureCause,
  WalkForwardOverfitRisk,
  WalkForwardEvidenceRules,
  WalkForwardEvidenceSummary,
  WalkForwardStabilitySummary,
  WalkForwardStabilityVerdict,
  WalkForwardWindowMetrics,
  WalkForwardWindowResult
} from "@/lib/walkForward/walkForwardTypes";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return 0;
  }
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

const consistencyScore = (values: number[], tolerance: number) => {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) {
    return clean.length ? 45 : 0;
  }
  const spread = Math.max(...clean) - Math.min(...clean);
  return clamp(100 - (spread / Math.max(tolerance, 0.0001)) * 100);
};

const oosMetrics = (windows: WalkForwardWindowResult[]) =>
  windows.map((window) => window.metricsBySplit.out_of_sample).filter(Boolean);

const defaultEvidenceRules: WalkForwardEvidenceRules = {
  minimumWindows: 3,
  preferredWindows: 3,
  minimumOosTradesPerWindow: 5,
  minimumTotalOosTrades: 20
};

const windowScore = (metrics: WalkForwardWindowMetrics) =>
  clamp(
    metrics.readinessScore * 0.28 +
      metrics.confidenceCalibration * 100 * 0.18 +
      clamp(metrics.totalTrades / 8, 0, 1) * 100 * 0.16 +
      clamp((metrics.averageR + 0.3) / 0.9, 0, 1) * 100 * 0.16 +
      clamp(1 - metrics.maxDrawdownR / 8, 0, 1) * 100 * 0.14 +
      clamp(1 - metrics.falsePositiveCount / Math.max(1, metrics.totalTrades + metrics.falsePositiveCount), 0, 1) * 100 * 0.08
  );

const overfitRiskFor = (windows: WalkForwardWindowResult[], outOfSample: WalkForwardWindowMetrics[]): WalkForwardOverfitRisk => {
  const inSampleAverageR = average(windows.map((window) => window.metricsBySplit.in_sample.averageR));
  const oosAverageR = average(outOfSample.map((metrics) => metrics.averageR));
  const inSampleWinRate = average(windows.map((window) => window.metricsBySplit.in_sample.winRate));
  const oosWinRate = average(outOfSample.map((metrics) => metrics.winRate));
  const oosFailures = outOfSample.filter((metrics) => !metrics.pass).length;

  if (oosFailures >= Math.max(1, Math.ceil(outOfSample.length / 2)) || inSampleAverageR - oosAverageR > 0.45 || inSampleWinRate - oosWinRate > 0.28) {
    return "high";
  }
  if (oosFailures > 0 || inSampleAverageR - oosAverageR > 0.2 || inSampleWinRate - oosWinRate > 0.14) {
    return "medium";
  }
  return "low";
};

const verdictFor = (
  stabilityScore: number,
  outOfSamplePassRate: number,
  overfitRisk: WalkForwardOverfitRisk,
  windowCount: number,
  totalOosTrades: number,
  enoughEvidence: boolean
): WalkForwardStabilityVerdict => {
  if (!enoughEvidence) {
    return "insufficient_evidence";
  }
  if (stabilityScore >= 82 && outOfSamplePassRate >= 0.8 && overfitRisk === "low" && windowCount >= 3 && totalOosTrades >= 20) {
    return "paper_demo_review_candidate";
  }
  if (stabilityScore >= 68 && outOfSamplePassRate >= 0.67 && overfitRisk !== "high" && totalOosTrades >= 12) {
    return "robust_research";
  }
  if (stabilityScore >= 48 && outOfSamplePassRate >= 0.5 && overfitRisk !== "high") {
    return "promising";
  }
  return "fail";
};

const failureCounts = (windows: WalkForwardWindowResult[]) => {
  const counts = new Map<string, number>();
  for (const reason of windows.flatMap((window) => safeArray(window.failReasons))) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => (count > 1 ? `${reason} (${count} windows)` : reason));
};

const likelyFailureCauseFor = (
  windows: WalkForwardWindowResult[],
  outOfSample: WalkForwardWindowMetrics[],
  repeatedFailureReasons: string[],
  overfitRisk: WalkForwardOverfitRisk
): WalkForwardLikelyFailureCause => {
  const reasonText = repeatedFailureReasons.join(" ").toLowerCase();
  const worstOosAverageR = outOfSample.length ? Math.min(...outOfSample.map((metrics) => metrics.averageR)) : 0;
  const worstOosDrawdown = outOfSample.length ? Math.max(...outOfSample.map((metrics) => metrics.maxDrawdownR)) : 0;
  const totalOosTrades = outOfSample.reduce((sum, metrics) => sum + metrics.totalTrades, 0);
  const worstEvidenceQuality = outOfSample.length ? Math.min(...outOfSample.map((metrics) => metrics.evidenceQualityScore)) : 100;
  const failedOosWindows = outOfSample.filter((metrics) => !metrics.pass).length;

  if (reasonText.includes("confidence calibration")) {
    return "confidence_calibration";
  }
  if (totalOosTrades < 8 || reasonText.includes("trade count")) {
    return "sample_size_too_low";
  }
  if (worstEvidenceQuality < 55) {
    return "evidence_quality_weak";
  }
  if (overfitRisk === "high") {
    return "overfit_risk";
  }
  if (windows.length < defaultEvidenceRules.minimumWindows || totalOosTrades < defaultEvidenceRules.minimumTotalOosTrades) {
    return "insufficient_evidence";
  }
  if (worstOosAverageR < -0.1 || reasonText.includes("average r")) {
    return "low_average_r";
  }
  if (worstOosDrawdown > 6 || reasonText.includes("drawdown")) {
    return "stop_model_fragility";
  }
  if (failedOosWindows === 1 && windows.length >= 3) {
    return "session_fragility";
  }
  return overfitRisk === "medium" ? "overfit_risk" : "target_model_fragility";
};

const recommendation = (
  label: string,
  rationale: string,
  target: WalkForwardLikelyFailureCause,
  candidateConfigHints: string[],
  suggestedSearchMode: WalkForwardFollowUpRecommendation["suggestedSearchMode"]
): WalkForwardFollowUpRecommendation => ({
  recommendationId: uid("walk_forward_recommendation"),
  label,
  rationale,
  target,
  candidateConfigHints,
  suggestedSearchMode
});

const recommendationsFor = (
  likelyFailureCause: WalkForwardLikelyFailureCause,
  failedOosWindows: number
): WalkForwardFollowUpRecommendation[] => {
  const recommendations: WalkForwardFollowUpRecommendation[] = [];

  if (likelyFailureCause === "confidence_calibration") {
    recommendations.push(
      recommendation(
        "Tighten confidence calibration",
        "Weak confidence calibration means the model confidence did not match realized outcomes across windows.",
        "confidence_calibration",
        [
          "raise minimum confidence threshold",
          "apply confidence penalty when evidence quality is weak",
          "require LLM agreement with CIO before promotion",
          "compare high/medium/low confidence bands"
        ],
        "conservative_only"
      )
    );
  }

  if (likelyFailureCause === "low_average_r" || likelyFailureCause === "target_model_fragility") {
    recommendations.push(
      recommendation(
        "Test target and invalidation models",
        "Negative or weak average R points to poor target selection, invalidation placement, or target/invalidation distance.",
        likelyFailureCause,
        [
          "test 1R target",
          "test 1.5R target",
          "test 2R target",
          "test FVG invalidation",
          "test structure-based invalidation",
          "reject setups with poor target/invalidation distance"
        ],
        "stop_model_focus"
      )
    );
  }

  if (failedOosWindows === 1 || likelyFailureCause === "session_fragility") {
    recommendations.push(
      recommendation(
        "Isolate the failed OOS window",
        "A single failed out-of-sample window can indicate session or directional fragility rather than a global strategy failure.",
        "session_fragility",
        [
          "compare session behavior in the failed window",
          "test NY AM only",
          "test London only",
          "compare long-only vs short-only in the failed window",
          "detect whether losses cluster around a time/session regime"
        ],
        "session_focus"
      )
    );
  }

  if (likelyFailureCause === "stop_model_fragility") {
    recommendations.push(
      recommendation(
        "Retest stop placement",
        "Worst-window drawdown suggests the current stop model may be too exposed to the failed regime.",
        "stop_model_fragility",
        [
          "test latest swing stop",
          "test FVG invalidation",
          "test structure-based invalidation",
          "reject setups where invalidation is too wide for the target"
        ],
        "stop_model_focus"
      )
    );
  }

  if (likelyFailureCause === "overfit_risk") {
    recommendations.push(
      recommendation(
        "Prefer simpler follow-up candidates",
        "Walk-forward degradation suggests the calibration may be too fitted to the selected window.",
        "overfit_risk",
        [
          "change one variable at a time",
          "prefer conservative-only candidates",
          "reduce candidate complexity",
          "require repeat OOS improvement before proposal approval"
        ],
        "conservative_only"
      )
    );
  }

  if (likelyFailureCause === "sample_size_too_low") {
    recommendations.push(
      recommendation(
        "Increase sample without broadening risk",
        "Too few out-of-sample trades makes the verdict fragile even when headline metrics look acceptable.",
        "sample_size_too_low",
        [
          "slightly lower confidence threshold",
          "widen session filter one step",
          "allow both long and short if safety filters pass",
          "rerun Standard walk-forward after enough trades are generated"
        ],
        "balanced"
      )
    );
  }

  if (likelyFailureCause === "insufficient_evidence") {
    recommendations.push(
      recommendation(
        "Increase walk-forward evidence",
        "The run did not produce enough windows or out-of-sample trades for a meaningful verdict.",
        "insufficient_evidence",
        [
          "use Standard preset",
          "increase max windows",
          "use a larger raw candle window",
          "reduce validation split size if needed",
          "keep Quick Auto Research while increasing data window"
        ],
        "quick"
      )
    );
  }

  if (likelyFailureCause === "evidence_quality_weak") {
    recommendations.push(
      recommendation(
        "Improve evidence quality before promotion",
        "The failed run relied on incomplete or weak evidence, so confidence should be discounted.",
        "evidence_quality_weak",
        [
          "add real session levels",
          "add imported higher-timeframe context",
          "label missing macro/intermarket evidence explicitly",
          "apply evidence-quality confidence penalty"
        ],
        "conservative_only"
      )
    );
  }

  return recommendations.length
    ? recommendations
    : [
        recommendation(
          "Run targeted Standard follow-up",
          "Failure cause is mixed, so the next search should test bounded session, direction, stop, and target variants.",
          "target_model_fragility",
          ["NY AM only + 1R", "FVG invalidation", "structure-based invalidation", "long-only", "short-only"],
          "standard"
        )
      ];
};

const buildFailureDiagnostics = (
  windows: WalkForwardWindowResult[],
  outOfSample: WalkForwardWindowMetrics[],
  overfitRisk: WalkForwardOverfitRisk,
  worstWindowId?: string,
  evidenceSummary?: WalkForwardEvidenceSummary
): WalkForwardFailureDiagnostics => {
  const repeatedFailureReasons = failureCounts(windows);
  const failedWindowCount = windows.filter((window) => window.verdict !== "pass").length;
  const failedOosWindows = outOfSample.filter((metrics) => !metrics.pass).length;
  const likelyFailureCause = evidenceSummary && !evidenceSummary.enoughEvidence
    ? "insufficient_evidence"
    : likelyFailureCauseFor(windows, outOfSample, repeatedFailureReasons, overfitRisk);
  const recommendations = recommendationsFor(likelyFailureCause, failedOosWindows);

  return {
    failedWindowCount,
    worstWindowId,
    worstOosWinRate: round(outOfSample.length ? Math.min(...outOfSample.map((metrics) => metrics.winRate)) : 0, 3),
    worstOosAverageR: round(outOfSample.length ? Math.min(...outOfSample.map((metrics) => metrics.averageR)) : 0, 2),
    worstOosDrawdown: round(outOfSample.length ? Math.max(...outOfSample.map((metrics) => metrics.maxDrawdownR)) : 0, 2),
    repeatedFailureReasons: evidenceSummary && !evidenceSummary.enoughEvidence
      ? evidenceSummary.insufficientEvidenceReasons
      : repeatedFailureReasons.length
        ? repeatedFailureReasons
        : ["No repeated failure reason was recorded."],
    likelyFailureCause,
    recommendations,
    summary:
      evidenceSummary && !evidenceSummary.enoughEvidence
        ? `Insufficient walk-forward evidence: ${evidenceSummary.insufficientEvidenceReasons[0] ?? "more windows and OOS trades are required"}.`
        : failedOosWindows > 0
        ? `${failedOosWindows}/${Math.max(1, outOfSample.length)} out-of-sample window(s) failed; likely cause is ${likelyFailureCause.replace(/_/g, " ")}.`
        : `Walk-forward did not fully promote; likely cause is ${likelyFailureCause.replace(/_/g, " ")}.`
  };
};

const buildFollowUpPlan = (
  sourceRunId: string,
  diagnostics: WalkForwardFailureDiagnostics
): WalkForwardFollowUpSearchPlan => ({
  planId: uid("walk_forward_followup"),
  timestamp: new Date().toISOString(),
  sourceRunId,
  planType: "walk_forward_failure_followup",
  likelyFailureCause: diagnostics.likelyFailureCause,
  worstWindowId: diagnostics.worstWindowId,
  recommendedSearchMode: diagnostics.recommendations[0]?.suggestedSearchMode ?? "standard",
  maxCandidateCount: diagnostics.likelyFailureCause === "overfit_risk" ? 5 : 8,
  recommendations: diagnostics.recommendations,
  status: "planned",
  safetyNotes: [
    "Follow-up search is simulation-only.",
    "It does not change the active baseline.",
    "It cannot execute trades, enable demo/live mode, or override readiness.",
    "Any proposal created later remains approval-required."
  ]
});

export function analyzeWalkForwardStability(
  windowsInput: WalkForwardWindowResult[],
  sourceRunId = "walk_forward_run",
  evidenceOptions: Partial<WalkForwardEvidenceSummary> = {}
): WalkForwardStabilitySummary {
  const windows = safeArray(windowsInput);
  const evidenceRules: WalkForwardEvidenceRules = {
    minimumWindows: evidenceOptions.minimumWindows ?? defaultEvidenceRules.minimumWindows,
    preferredWindows: evidenceOptions.preferredWindows ?? defaultEvidenceRules.preferredWindows,
    minimumOosTradesPerWindow:
      evidenceOptions.minimumOosTradesPerWindow ?? defaultEvidenceRules.minimumOosTradesPerWindow,
    minimumTotalOosTrades: evidenceOptions.minimumTotalOosTrades ?? defaultEvidenceRules.minimumTotalOosTrades
  };
  const outOfSample = oosMetrics(windows);
  const winRates = outOfSample.map((metrics) => metrics.winRate);
  const averageRs = outOfSample.map((metrics) => metrics.averageR);
  const drawdowns = outOfSample.map((metrics) => metrics.maxDrawdownR);
  const tradeCounts = outOfSample.map((metrics) => metrics.totalTrades);
  const falsePositives = outOfSample.map((metrics) => metrics.falsePositiveCount);
  const readinessScores = outOfSample.map((metrics) => metrics.readinessScore);
  const outOfSampleWindowsPassed = outOfSample.filter((metrics) => metrics.pass).length;
  const windowsPassed = windows.filter((window) => window.verdict === "pass").length;
  const outOfSamplePassRate = outOfSampleWindowsPassed / Math.max(1, outOfSample.length);
  const totalOosTrades = outOfSample.reduce((sum, metrics) => sum + metrics.totalTrades, 0);
  const windowsBelowMinimumOosTrades = outOfSample.filter((metrics) => metrics.totalTrades < evidenceRules.minimumOosTradesPerWindow).length;
  const insufficientEvidenceReasons = [
    windows.length < evidenceRules.minimumWindows
      ? `Only ${windows.length} walk-forward window(s) were generated; ${evidenceRules.minimumWindows} are required for a meaningful verdict.`
      : undefined,
    windowsBelowMinimumOosTrades > 0
      ? `${windowsBelowMinimumOosTrades} out-of-sample window(s) had fewer than ${evidenceRules.minimumOosTradesPerWindow} trades.`
      : undefined,
    totalOosTrades < evidenceRules.minimumTotalOosTrades
      ? `Out-of-sample trade count too low: ${totalOosTrades}/${evidenceRules.minimumTotalOosTrades}.`
      : undefined
  ].filter((reason): reason is string => Boolean(reason));
  const evidenceSummary: WalkForwardEvidenceSummary = {
    ...evidenceRules,
    requestedMaxWindows: evidenceOptions.requestedMaxWindows ?? windows.length,
    actualWindowsGenerated: evidenceOptions.actualWindowsGenerated ?? windows.length,
    totalOosTrades,
    windowsBelowMinimumOosTrades,
    enoughEvidence: insufficientEvidenceReasons.length === 0,
    insufficientEvidenceReasons,
    windowGenerationNotes: safeArray(evidenceOptions.windowGenerationNotes)
  };
  const overfitRisk = evidenceSummary.enoughEvidence ? overfitRiskFor(windows, outOfSample) : "not_applicable";
  const averageWinRate = average(winRates);
  const averageRConsistency = consistencyScore(averageRs, 0.45);
  const tradeCountConsistency = consistencyScore(tradeCounts, 12);
  const falsePositiveConsistency = consistencyScore(falsePositives, 12);
  const readinessConsistency = consistencyScore(readinessScores, 35);
  const stabilityScore = round(
    clamp(
      average(outOfSample.map(windowScore)) * 0.34 +
        averageRConsistency * 0.18 +
        tradeCountConsistency * 0.12 +
        falsePositiveConsistency * 0.12 +
        readinessConsistency * 0.14 +
        outOfSamplePassRate * 100 * 0.1 -
        (overfitRisk === "high" ? 22 : overfitRisk === "medium" ? 10 : 0)
    ),
    0
  );
  const verdict = verdictFor(stabilityScore, outOfSamplePassRate, overfitRisk, windows.length, totalOosTrades, evidenceSummary.enoughEvidence);
  const scoredWindows = windows.map((window) => ({
    windowId: window.windowId,
    score: windowScore(window.metricsBySplit.out_of_sample)
  }));
  const bestWindow = [...scoredWindows].sort((a, b) => b.score - a.score)[0];
  const worstWindow = [...scoredWindows].sort((a, b) => a.score - b.score)[0];
  const failReasons = [
    outOfSample.length < 2 ? "At least two out-of-sample windows are needed before trusting walk-forward stability." : undefined,
    totalOosTrades < evidenceRules.minimumTotalOosTrades ? "Out-of-sample trade count too low." : undefined,
    outOfSamplePassRate < 0.5 ? "Most out-of-sample windows failed the stability gate." : undefined,
    overfitRisk === "high" ? "In-sample results degraded materially out-of-sample; overfit risk is high." : undefined,
    Math.min(...averageRs, 0) < -0.1 ? "Worst-window average R is too weak." : undefined
  ].filter((reason): reason is string => Boolean(reason));
  const diagnostics = buildFailureDiagnostics(windows, outOfSample, overfitRisk, worstWindow?.windowId, evidenceSummary);
  const followUpPlan = verdict === "insufficient_evidence" || verdict === "fail" || failReasons.length || outOfSampleWindowsPassed < outOfSample.length
    ? buildFollowUpPlan(sourceRunId, diagnostics)
    : undefined;

  return {
    windowCount: windows.length,
    windowsPassed,
    outOfSampleWindowsPassed,
    averageWinRate: round(averageWinRate, 3),
    medianWinRate: round(median(winRates), 3),
    worstWindowWinRate: round(winRates.length ? Math.min(...winRates) : 0, 3),
    averageRConsistency: round(averageRConsistency, 0),
    worstWindowAverageR: round(averageRs.length ? Math.min(...averageRs) : 0, 2),
    worstWindowDrawdownR: round(drawdowns.length ? Math.max(...drawdowns) : 0, 2),
    tradeCountConsistency: round(tradeCountConsistency, 0),
    falsePositiveConsistency: round(falsePositiveConsistency, 0),
    readinessConsistency: round(readinessConsistency, 0),
    overfitRisk,
    stabilityScore,
    verdict,
    bestWindowId: bestWindow?.windowId,
    worstWindowId: worstWindow?.windowId,
    recommendedNextAction:
      verdict === "paper_demo_review_candidate"
        ? "Review readiness and proposal evidence manually. Broker execution remains disabled."
        : verdict === "robust_research"
          ? "Run another imported-data window or standard/deeper walk-forward pass before Paper-Demo Candidate review."
          : verdict === "promising"
            ? "Use the strongest out-of-sample window to guide a bounded calibration follow-up."
            : "Do not promote. Diagnose the weakest out-of-sample window and continue simulation research.",
    summary:
      verdict === "insufficient_evidence"
        ? "Walk-forward validation has insufficient evidence; increase windows or out-of-sample trade count before judging strategy quality."
        : verdict === "fail"
        ? "Walk-forward validation failed; one selected window is not enough evidence."
        : `Walk-forward validation is ${verdict.replace(/_/g, " ")} with ${overfitRisk} overfit risk.`,
    failReasons,
    evidenceSummary,
    diagnostics,
    followUpPlan
  };
}
