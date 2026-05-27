import type { ResearchMaturityCycleInput, ResearchMaturityGrade, ResearchMaturityInput, ResearchMaturitySummary } from "@/lib/maturity/researchMaturityTypes";
import { safeArray } from "@/lib/utils";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const now = () => new Date().toISOString();

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const normalizedSpreadScore = (values: number[], tolerance: number) => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) {
    return clean.length ? 45 : 0;
  }
  const spread = Math.max(...clean) - Math.min(...clean);
  return clamp(100 - (spread / Math.max(tolerance, 0.0001)) * 100);
};

const distinctCount = (values: Array<string | undefined>) => new Set(values.filter(Boolean)).size;

const cycleTimestamp = (cycle: ResearchMaturityCycleInput) => cycle.timestamp ?? "";

const readinessTrendFor = (cycles: ResearchMaturityCycleInput[]): ResearchMaturitySummary["readinessTrend"] => {
  const scores = cycles
    .filter((cycle) => typeof cycle.readinessScore === "number")
    .sort((a, b) => cycleTimestamp(a).localeCompare(cycleTimestamp(b)))
    .map((cycle) => cycle.readinessScore ?? 0);
  if (scores.length < 2) {
    return "unknown";
  }
  const delta = scores[scores.length - 1] - scores[0];
  if (delta >= 8) {
    return "improving";
  }
  if (delta <= -8) {
    return "declining";
  }
  return "stable";
};

const proposalFailed = (verdict?: string) =>
  verdict === "reject" || verdict === "needs_follow_up" || verdict === "no_material_change";

const gradeForScore = (score: number): ResearchMaturityGrade => {
  if (score >= 85) {
    return "paper_demo_candidate_review";
  }
  if (score >= 70) {
    return "robust_research";
  }
  if (score >= 52) {
    return "research_ready";
  }
  if (score > 0) {
    return "early_research";
  }
  return "untested";
};

const capGrade = (grade: ResearchMaturityGrade, maxGrade: ResearchMaturityGrade): ResearchMaturityGrade => {
  const order: ResearchMaturityGrade[] = [
    "untested",
    "early_research",
    "research_ready",
    "robust_research",
    "paper_demo_candidate_review"
  ];
  return order[Math.min(order.indexOf(grade), order.indexOf(maxGrade))];
};

const scoreCapForGrade = (grade: ResearchMaturityGrade) => {
  switch (grade) {
    case "untested":
      return 0;
    case "early_research":
      return 49;
    case "research_ready":
      return 69;
    case "robust_research":
      return 84;
    case "paper_demo_candidate_review":
    default:
      return 100;
  }
};

export function calculateResearchMaturity(input: ResearchMaturityInput): ResearchMaturitySummary {
  const cycles = safeArray(input.cycles)
    .filter((cycle) => cycle.status !== "failed")
    .sort((a, b) => cycleTimestamp(b).localeCompare(cycleTimestamp(a)))
    .slice(0, 20);
  const activeCalibrationId = input.activeCalibrationId;
  const currentCalibrationCycles = activeCalibrationId
    ? cycles.filter((cycle) => cycle.activeCalibrationId === activeCalibrationId)
    : cycles.filter((cycle) => !cycle.activeCalibrationId);
  const maturityCycles = currentCalibrationCycles.length ? currentCalibrationCycles : cycles;
  const importedDataCycles = maturityCycles.filter((cycle) => cycle.dataSourceMode === "imported").length;
  const mockDataCycles = maturityCycles.filter((cycle) => cycle.dataSourceMode !== "imported").length;
  const dataWindowsTested = distinctCount(maturityCycles.map((cycle) => cycle.candleWindow));
  const totalSimulatedTrades = maturityCycles.reduce((sum, cycle) => sum + (cycle.totalTrades ?? 0), 0);
  const llmAdvisoryPassCount = maturityCycles.filter((cycle) => cycle.llmAdvisoryPassed).length;
  const latestWalkForwardRun = input.latestWalkForwardRun;
  const walkForwardWindowsTested = latestWalkForwardRun?.stability?.windowCount ?? 0;
  const walkForwardOutOfSamplePassed = latestWalkForwardRun?.stability?.outOfSampleWindowsPassed ?? 0;
  const walkForwardScore = latestWalkForwardRun?.stability
    ? Math.min(
        100,
        latestWalkForwardRun.stability.stabilityScore +
          (latestWalkForwardRun.stability.overfitRisk === "low" ? 8 : latestWalkForwardRun.stability.overfitRisk === "medium" ? 0 : -18)
      )
    : 0;
  const safeWindowCycles = maturityCycles.filter((cycle) => cycle.researchPreset === "safe").length;
  const standardWindowCycles = maturityCycles.filter((cycle) => cycle.researchPreset === "standard").length;
  const advancedWindowCycles = maturityCycles.filter((cycle) => cycle.researchPreset === "advanced").length;
  const winRateConsistency = normalizedSpreadScore(maturityCycles.map((cycle) => cycle.winRate ?? 0), 0.18);
  const averageRConsistency = normalizedSpreadScore(maturityCycles.map((cycle) => cycle.averageR ?? 0), 0.35);
  const drawdownConsistency = normalizedSpreadScore(maturityCycles.map((cycle) => cycle.maxDrawdownR ?? 0), 4);
  const falsePositiveConsistency = normalizedSpreadScore(maturityCycles.map((cycle) => cycle.falsePositiveCount ?? 0), 20);
  const sessionConsistency = Math.round(average([winRateConsistency, averageRConsistency, drawdownConsistency]));
  const readinessTrend = readinessTrendFor(maturityCycles);
  const acceptedProposalCount = input.proposals.filter((proposal) => proposal.status === "accepted").length;
  const rejectedProposalCount = input.proposals.filter((proposal) => proposal.status === "rejected").length;
  const noOpOrFailedProposalCount = input.proposals.filter((proposal) =>
    proposalFailed(proposal.metricsSnapshot?.comparisonResult?.promotionVerdict ?? proposal.comparisonResult?.promotionVerdict)
  ).length;

  const breakdown = {
    calibrationSurvival: clamp((currentCalibrationCycles.length / 4) * 100),
    cycleCoverage: clamp((maturityCycles.length / 5) * 100),
    windowCoverage: clamp((dataWindowsTested / 3) * 100),
    tradeSample: clamp((totalSimulatedTrades / 120) * 100),
    performanceConsistency: Math.round(average([winRateConsistency, averageRConsistency, drawdownConsistency, falsePositiveConsistency])),
    llmReview: clamp((llmAdvisoryPassCount / 3) * 100),
    evidenceQuality: clamp(input.evidenceQualityScore),
    walkForward: clamp(walkForwardScore),
    readinessTrend: readinessTrend === "improving" ? 85 : readinessTrend === "stable" ? 70 : readinessTrend === "declining" ? 25 : 35,
    proposalDiscipline: clamp(70 + acceptedProposalCount * 5 - noOpOrFailedProposalCount * 10 - rejectedProposalCount * 2),
    dataReality: importedDataCycles ? clamp((importedDataCycles / Math.max(3, maturityCycles.length)) * 100) : 20
  };

  let score = Math.round(
    breakdown.calibrationSurvival * 0.12 +
      breakdown.cycleCoverage * 0.12 +
      breakdown.windowCoverage * 0.1 +
      breakdown.tradeSample * 0.12 +
      breakdown.performanceConsistency * 0.14 +
      breakdown.llmReview * 0.1 +
      breakdown.evidenceQuality * 0.1 +
      breakdown.walkForward * 0.02 +
      breakdown.readinessTrend * 0.08 +
      breakdown.proposalDiscipline * 0.05 +
      breakdown.dataReality * 0.05
  );

  const missingRequirements: string[] = [];
  if (!maturityCycles.length) missingRequirements.push("Run repeated AI Research Cycles with the current calibration.");
  if (currentCalibrationCycles.length < 2) missingRequirements.push("Current calibration needs at least two surviving research cycles.");
  if (dataWindowsTested < 2) missingRequirements.push("Test at least two distinct candle windows or presets.");
  if (totalSimulatedTrades < 50) missingRequirements.push("Collect at least 50 simulated trades before trusting maturity.");
  if (llmAdvisoryPassCount < 1) missingRequirements.push("Run and pass LLM advisory review.");
  if (!latestWalkForwardRun) missingRequirements.push("Run walk-forward validation on imported data.");
  if (latestWalkForwardRun && latestWalkForwardRun.stability?.overfitRisk === "high") {
    missingRequirements.push("Walk-forward overfit risk is high; test a simpler calibration across more windows.");
  }
  if (input.evidenceQualityScore < 60) missingRequirements.push("Improve evidence quality before Paper-Demo Candidate review.");
  if (!importedDataCycles) missingRequirements.push("Use imported historical data; mock-only runs cap maturity.");
  if (readinessTrend === "declining") missingRequirements.push("Readiness trend is declining across tested cycles.");

  let grade = gradeForScore(score);
  const caps: ResearchMaturityGrade[] = [];
  if (!maturityCycles.length) caps.push("untested");
  if (!importedDataCycles) caps.push("early_research");
  if (input.evidenceQualityScore < 55) caps.push("early_research");
  if (totalSimulatedTrades < 50) caps.push("early_research");
  if (llmAdvisoryPassCount < 1) caps.push("early_research");
  if (maturityCycles.length < 2 || dataWindowsTested < 2) caps.push("research_ready");
  if (!latestWalkForwardRun || walkForwardWindowsTested < 2 || latestWalkForwardRun.stability?.overfitRisk === "high") {
    caps.push("robust_research");
  }
  if (importedDataCycles < 3 || totalSimulatedTrades < 100 || llmAdvisoryPassCount < 2 || input.evidenceQualityScore < 70) {
    caps.push("robust_research");
  }
  for (const cap of caps) {
    grade = capGrade(grade, cap);
  }
  score = Math.min(score, scoreCapForGrade(grade));

  const maturityWarnings = [
    !importedDataCycles ? "Mock-only data caps maturity at early research." : undefined,
    input.evidenceQualityScore < 60 ? "Low evidence quality caps maturity and should block Paper-Demo Candidate confidence." : undefined,
    totalSimulatedTrades < 50 ? "Too few simulated trades to trust calibration maturity." : undefined,
    llmAdvisoryPassCount < 1 ? "Missing LLM advisory review caps maturity." : undefined,
    currentCalibrationCycles.length < 2 ? "New or recently changed calibration must survive more cycles before maturity improves." : undefined,
    !latestWalkForwardRun ? "No walk-forward validation exists yet for the active research state." : undefined,
    latestWalkForwardRun?.stability?.overfitRisk === "high" ? "Walk-forward validation reports high overfit risk." : undefined,
    readinessTrend === "declining" ? "Readiness trend is declining." : undefined
  ].filter((warning): warning is string => Boolean(warning));

  const nextMaturityRequirement =
    missingRequirements[0] ??
    (grade === "paper_demo_candidate_review"
      ? "Maintain imported-data stability and review readiness without enabling execution."
      : "Run another imported-data cycle on a different window to raise maturity.");

  return {
    generatedAt: now(),
    grade,
    score,
    breakdown,
    activeCalibrationId,
    activeCalibrationApprovedAt: input.activeCalibrationApprovedAt,
    activeCalibrationSurvivalCount: currentCalibrationCycles.length,
    cyclesTested: maturityCycles.length,
    cyclesWithCurrentCalibration: currentCalibrationCycles.length,
    dataWindowsTested,
    safeWindowCycles,
    standardWindowCycles,
    advancedWindowCycles,
    importedDataCycles,
    mockDataCycles,
    totalSimulatedTrades,
    winRateConsistency,
    averageRConsistency,
    drawdownConsistency,
    falsePositiveConsistency,
    sessionConsistency,
    llmAdvisoryPassCount,
    walkForwardWindowsTested,
    walkForwardOutOfSamplePassed,
    latestWalkForwardVerdict: latestWalkForwardRun?.stability?.verdict,
    latestWalkForwardOverfitRisk: latestWalkForwardRun?.stability?.overfitRisk,
    evidenceQualityScore: input.evidenceQualityScore,
    readinessTrend,
    acceptedProposalCount,
    rejectedProposalCount,
    noOpOrFailedProposalCount,
    missingRequirements,
    maturityWarnings,
    nextMaturityRequirement,
    cycleWindowHistory: maturityCycles.slice(0, 8).map((cycle) => ({
      cycleId: cycle.cycleId,
      timestamp: cycle.timestamp,
      dataSourceMode: cycle.dataSourceMode,
      researchPreset: cycle.researchPreset,
      candleWindow: cycle.candleWindow,
      totalTrades: cycle.totalTrades ?? 0,
      winRate: cycle.winRate ?? 0,
      averageR: cycle.averageR ?? 0,
      maxDrawdownR: cycle.maxDrawdownR ?? 0,
      readinessScore: cycle.readinessScore ?? 0,
      llmAdvisoryPassed: Boolean(cycle.llmAdvisoryPassed)
    })),
    safetyNotice: "Research maturity can block advancement, but cannot approve execution or override readiness."
  };
}
