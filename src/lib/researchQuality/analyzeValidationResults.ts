import type { ValidationScenarioResult, ValidationSuiteReport } from "@/lib/validation";
import { isLLMAdvisoryReviewPassed } from "@/lib/llm/llmProvider";
import { analyzeDrawdownClusters } from "@/lib/researchQuality/drawdownAnalysis";
import { analyzeFalsePositivePatterns } from "@/lib/researchQuality/falsePositiveAnalysis";
import { compareLongShortPerformance, compareSessions } from "@/lib/researchQuality/sessionComparison";
import { safeArray, safeTopN } from "@/lib/utils";
import type {
  AgentUsefulnessReview,
  InvalidationTargetQualityReview,
  ResearchQualityFinding,
  ResearchQualityReadinessGrade,
  ResearchQualityReview,
  SuggestedCalibrationChange,
  ThresholdSensitivityReview
} from "@/lib/researchQuality/researchQualityTypes";

export const RESEARCH_QUALITY_STORAGE_KEY = "gotrader_ai_lab_latest_research_quality_review";
export const RESEARCH_QUALITY_UPDATED_EVENT = "gotrader-ai-lab-research-quality-updated";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const scenarioById = (report: ValidationSuiteReport, id: string) =>
  safeArray(report.scenarios).find((scenario) => scenario.id === id);

const readinessGradeFor = (report: ValidationSuiteReport): ResearchQualityReadinessGrade => {
  const scenarios = safeArray(report.scenarios);
  const greenScenarios = scenarios.filter((scenario) => scenario.readiness === "green").length;
  const averageScenarioScore = average(scenarios.map((scenario) => scenario.score));
  if (report.calibration.readinessStatus === "green" && report.calibration.readinessScore >= 70 && greenScenarios >= 4) {
    return isLLMAdvisoryReviewPassed() ? "Paper-Demo Candidate" : "Research Ready";
  }
  if (report.calibration.readinessStatus !== "red" && averageScenarioScore >= 45) {
    return "Research Ready";
  }
  return "Not Ready";
};

const statusForGrade = (grade: ResearchQualityReadinessGrade) =>
  grade === "Paper-Demo Candidate" ? "green" : grade === "Research Ready" ? "yellow" : "red";

const finding = (
  title: string,
  detail: string,
  evidence: string,
  severity: ResearchQualityFinding["severity"],
  relatedScenarios: string[]
): ResearchQualityFinding => ({ title, detail, evidence, severity, relatedScenarios });

const topWeaknessesFor = (report: ValidationSuiteReport): ResearchQualityFinding[] => {
  const scenarios = safeArray(report.scenarios);
  const weakest = [...scenarios].sort((a, b) => a.score - b.score)[0];
  const highCalibrationGap = [...scenarios].sort(
    (a, b) => b.confidenceCalibration.calibrationGap - a.confidenceCalibration.calibrationGap
  )[0];
  const worstDrawdown = [...scenarios].sort((a, b) => b.maxDrawdown - a.maxDrawdown)[0];
  if (!weakest || !highCalibrationGap || !worstDrawdown) {
    return [
      finding(
        "Validation data missing",
        "No scenario results were available for quality review.",
        "Run /validation again to regenerate scenario metrics.",
        "red",
        []
      )
    ];
  }
  const weaknessFindings = [
    finding(
      "Weakest validation scenario",
      `${weakest.name} had the lowest composite score in the suite.`,
      `Score ${weakest.score}, average R ${weakest.averageR.toFixed(2)}, skipped ${weakest.skippedSignals}.`,
      weakest.readiness,
      [weakest.name]
    ),
    finding(
      "Confidence calibration gap",
      `${highCalibrationGap.name} had the largest gap between stated confidence and realized win rate.`,
      `Gap ${Math.round(highCalibrationGap.confidenceCalibration.calibrationGap * 100)}%, average confidence ${Math.round(
        highCalibrationGap.confidenceCalibration.averageConfidence * 100
      )}%.`,
      highCalibrationGap.confidenceCalibration.calibrationGap > 0.25 ? "red" : "yellow",
      [highCalibrationGap.name]
    ),
    finding(
      "Drawdown pressure",
      `${worstDrawdown.name} showed the largest simulated drawdown cluster.`,
      `Max drawdown ${worstDrawdown.maxDrawdown.toFixed(2)}R, worst trade ${worstDrawdown.worstTradeR.toFixed(2)}R.`,
      worstDrawdown.maxDrawdown >= 4 ? "red" : "yellow",
      [worstDrawdown.name]
    ),
    ...safeArray(report.calibration.weakICTRules).map((rule) =>
      finding("Weak ICT assumption", rule, "Flagged by the validation calibration report.", "yellow" as const, [])
    )
  ];

  return safeTopN(weaknessFindings, 5);
};

const topStrengthsFor = (report: ValidationSuiteReport): ResearchQualityFinding[] => {
  const scenarios = safeArray(report.scenarios);
  const strongest = [...scenarios].sort((a, b) => b.score - a.score)[0];
  const bestAverageR = [...scenarios].sort((a, b) => b.averageR - a.averageR)[0];
  const bestCalibration = [...scenarios].sort((a, b) => b.confidenceCalibration.score - a.confidenceCalibration.score)[0];
  const bestAgent = safeArray(report.calibration.agentWeightsToIncrease)[0];
  if (!strongest || !bestAverageR || !bestCalibration) {
    return [
      finding(
        "Auditable workflow",
        "Validation and quality review remain deterministic, local, and exportable.",
        "Run /validation again to restore complete scenario metrics.",
        "yellow",
        []
      )
    ];
  }

  return safeTopN([
    finding(
      "Strongest validation scenario",
      `${strongest.name} produced the best composite quality score.`,
      `Score ${strongest.score}, win rate ${Math.round(strongest.winRate * 100)}%, average R ${strongest.averageR.toFixed(2)}.`,
      strongest.readiness,
      [strongest.name]
    ),
    finding(
      "Best payoff profile",
      `${bestAverageR.name} had the strongest average simulated R multiple.`,
      `Average R ${bestAverageR.averageR.toFixed(2)}, profit factor ${
        bestAverageR.profitFactor === null ? "n/a" : bestAverageR.profitFactor.toFixed(2)
      }.`,
      bestAverageR.averageR > 0 ? "green" : "yellow",
      [bestAverageR.name]
    ),
    finding(
      "Best confidence calibration",
      `${bestCalibration.name} had the closest confidence-to-outcome alignment.`,
      `Calibration score ${Math.round(bestCalibration.confidenceCalibration.score * 100)}%.`,
      bestCalibration.confidenceCalibration.score >= 0.7 ? "green" : "yellow",
      [bestCalibration.name]
    ),
    finding(
      "Agent evidence",
      bestAgent ? `${bestAgent.name} is the clearest candidate for higher weighting.` : "No agent deserves a higher weight yet.",
      bestAgent ? bestAgent.reason : "Validation did not produce a strong agent-weight increase signal.",
      bestAgent ? "green" : "yellow",
      bestAgent ? [bestAgent.name] : []
    ),
    finding(
      "Auditable workflow",
      "Validation and quality review remain deterministic, local, and exportable.",
      "All conclusions come from mock OHLC replay and local storage.",
      "green",
      []
    )
  ], 5);
};

const thresholdSensitivityFor = (
  dimension: "confluence" | "confidence",
  stronger: ValidationScenarioResult | undefined,
  looser: ValidationScenarioResult | undefined
): ThresholdSensitivityReview => {
  const scoreSpread = (stronger?.score ?? 0) - (looser?.score ?? 0);
  const tradeSpread = (stronger?.totalTrades ?? 0) - (looser?.totalTrades ?? 0);
  return {
    dimension,
    strongerFilterScenario: stronger?.name ?? "n/a",
    looserFilterScenario: looser?.name ?? "n/a",
    scoreSpread,
    tradeSpread,
    conclusion:
      scoreSpread >= 10
        ? "Stricter filtering improved simulated quality."
        : scoreSpread <= -10
          ? "Stricter filtering reduced simulated quality or over-filtered opportunities."
          : "Filter sensitivity is inconclusive in this mock sample."
  };
};

const invalidationTargetQualityFor = (report: ValidationSuiteReport): InvalidationTargetQualityReview[] =>
  [
    ["Latest swing", scenarioById(report, "swing-stop")],
    ["Fixed ticks", scenarioById(report, "fixed-tick-stop")],
    ["FVG invalidation", scenarioById(report, "fvg-invalidation")]
  ]
    .filter((item): item is [string, ValidationScenarioResult] => Boolean(item[1]))
    .map(([model, scenario]) => ({
      model,
      scenarioName: scenario.name,
      averageR: scenario.averageR,
      maxDrawdown: scenario.maxDrawdown,
      profitFactor: scenario.profitFactor,
      bestTradeR: scenario.bestTradeR,
      worstTradeR: scenario.worstTradeR,
      verdict:
        scenario.averageR > 0 && scenario.maxDrawdown <= 3
          ? "Usable in simulation; retest against broader mock samples."
          : "Weak or fragile; do not promote without further calibration."
    }));

const agentUsefulnessFor = (report: ValidationSuiteReport): AgentUsefulnessReview[] => {
  const map = new Map<string, { name: string; alignments: number[]; confidences: number[]; recommendations: string[] }>();
  for (const scenario of safeArray(report.scenarios)) {
    for (const agent of safeArray(scenario.agentContributionSummary)) {
      const current = map.get(agent.agentId) ?? { name: agent.name, alignments: [], confidences: [], recommendations: [] };
      current.alignments.push(agent.cioAlignmentRate);
      current.confidences.push(agent.averageConfidence);
      current.recommendations.push(agent.recommendation);
      map.set(agent.agentId, current);
    }
  }

  return [...map.entries()]
    .map(([agentId, agent]) => {
      const averageAlignment = round(average(agent.alignments), 3);
      const averageConfidence = round(average(agent.confidences), 3);
      const usefulnessScore = round(100 * (0.58 * averageAlignment + 0.42 * averageConfidence), 0);
      const decreaseVotes = agent.recommendations.filter((item) => item === "decrease").length;
      const increaseVotes = agent.recommendations.filter((item) => item === "increase").length;
      const recommendation: AgentUsefulnessReview["recommendation"] =
        increaseVotes > decreaseVotes ? "increase" : decreaseVotes > increaseVotes ? "decrease" : "hold";
      return {
        agentId,
        name: agent.name,
        usefulnessScore,
        averageAlignment,
        averageConfidence,
        recommendation,
        evidence: `Average CIO alignment ${Math.round(averageAlignment * 100)}%, average confidence ${Math.round(
          averageConfidence * 100
        )}%.`
      };
    })
    .sort((a, b) => b.usefulnessScore - a.usefulnessScore);
};

const suggestedCalibrationChangesFor = (report: ValidationSuiteReport): SuggestedCalibrationChange[] => {
  const changes: SuggestedCalibrationChange[] = [
    {
      parameter: "Minimum confluence threshold",
      currentValue: "Active backtest config",
      suggestedValue: report.calibration.recommendedConfluenceThreshold.toFixed(2),
      rationale: "Uses the strongest non-negative validation scenario as the current deterministic recommendation.",
      priority: "high"
    },
    {
      parameter: "Minimum confidence threshold",
      currentValue: "Active backtest config",
      suggestedValue: report.calibration.recommendedConfidenceThreshold.toFixed(2),
      rationale: "Keeps CIO confidence closer to realized simulated hit rate.",
      priority: "high"
    }
  ];

  for (const agent of safeTopN(report.calibration.agentWeightsToIncrease, 2)) {
    changes.push({
      parameter: `${agent.name} weight`,
      currentValue: "Current local agent weight",
      suggestedValue: "Increase slightly",
      rationale: agent.reason,
      priority: "medium"
    });
  }

  for (const agent of safeTopN(report.calibration.agentWeightsToDecrease, 2)) {
    changes.push({
      parameter: `${agent.name} weight`,
      currentValue: "Current local agent weight",
      suggestedValue: "Decrease or hold out",
      rationale: agent.reason,
      priority: "medium"
    });
  }

  return safeTopN(changes, 5);
};

const nextStepFor = (grade: ResearchQualityReadinessGrade) => {
  if (grade === "Paper-Demo Candidate") {
    return "Do not add broker code yet. Repeat validation on broader mock samples, then review paper-demo risk gates.";
  }
  if (!isLLMAdvisoryReviewPassed()) {
    return "LLM advisory review required before Paper-Demo Candidate. Deterministic fallback can support Research Ready only.";
  }
  if (grade === "Research Ready") {
    return "Keep the strategy in simulation. Tune weak assumptions and rerun validation before paper-demo consideration.";
  }
  return "Do not proceed to broker demo. Focus on weak ICT assumptions, false positives, and drawdown calibration.";
};

export function analyzeValidationResults(report: ValidationSuiteReport): ResearchQualityReview {
  const generatedAt = new Date().toISOString();
  const readinessGrade = readinessGradeFor(report);

  return {
    id: `research_quality_${Date.now()}`,
    generatedAt,
    sourceValidationId: report.id,
    sourceValidationGeneratedAt: report.generatedAt,
    readinessGrade,
    readinessStatus: statusForGrade(readinessGrade),
    readinessScore: report.calibration.readinessScore,
    topWeaknesses: topWeaknessesFor(report),
    topStrengths: topStrengthsFor(report),
    suggestedCalibrationChanges: suggestedCalibrationChangesFor(report),
    sessionComparison: compareSessions(report),
    falsePositivePatterns: analyzeFalsePositivePatterns(report),
    drawdownClusters: analyzeDrawdownClusters(report),
    agentUsefulness: agentUsefulnessFor(report),
    confluenceThresholdSensitivity: thresholdSensitivityFor(
      "confluence",
      scenarioById(report, "conservative-confluence"),
      scenarioById(report, "aggressive-confluence")
    ),
    confidenceThresholdSensitivity: thresholdSensitivityFor(
      "confidence",
      scenarioById(report, "high-confidence-only"),
      scenarioById(report, "aggressive-confluence")
    ),
    longShortComparison: compareLongShortPerformance(report),
    invalidationTargetQuality: invalidationTargetQualityFor(report),
    recommendedNextStep: nextStepFor(readinessGrade),
    safetyNotice: "Simulation/backtesting review only. No broker connection. No real trades."
  };
}

export function saveLatestResearchQualityReview(review: ResearchQualityReview) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RESEARCH_QUALITY_STORAGE_KEY, JSON.stringify(review));
  window.dispatchEvent(new CustomEvent(RESEARCH_QUALITY_UPDATED_EVENT, { detail: review }));
}

export function loadLatestResearchQualityReview(): ResearchQualityReview | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = window.localStorage.getItem(RESEARCH_QUALITY_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as ResearchQualityReview;
  } catch {
    return undefined;
  }
}
