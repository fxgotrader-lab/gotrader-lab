import type {
  CalibrationReport,
  ValidationAgentWeightRecommendation,
  ValidationReadinessStatus,
  ValidationSuiteReport,
  ValidationScenarioResult
} from "@/lib/validation/validationTypes";

export const VALIDATION_REPORT_STORAGE_KEY = "gotrader_ai_lab_latest_validation_report";
export const VALIDATION_REPORT_UPDATED_EVENT = "gotrader-ai-lab-validation-report-updated";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const byScoreDesc = (a: ValidationScenarioResult, b: ValidationScenarioResult) => b.score - a.score;

const labelOrFallback = (scenario?: ValidationScenarioResult) => scenario?.name ?? "Insufficient simulated sample";

const bestByCategory = (scenarios: ValidationScenarioResult[], category: ValidationScenarioResult["category"]) =>
  scenarios.filter((scenario) => scenario.category === category).sort(byScoreDesc)[0];

const worstByCategory = (scenarios: ValidationScenarioResult[], category: ValidationScenarioResult["category"]) =>
  scenarios.filter((scenario) => scenario.category === category).sort((a, b) => a.score - b.score)[0];

const thresholdSource = (scenarios: ValidationScenarioResult[]) =>
  [...scenarios]
    .filter((scenario) => scenario.totalTrades > 0 && scenario.averageR >= 0)
    .sort(byScoreDesc)[0] ?? [...scenarios].sort(byScoreDesc)[0];

const recommendationForAgents = (
  scenarios: ValidationScenarioResult[],
  mode: "increase" | "decrease"
): ValidationAgentWeightRecommendation[] => {
  const map = new Map<
    string,
    {
      agentId: string;
      name: string;
      alignment: number[];
      confidence: number[];
      totalOpinions: number;
    }
  >();

  for (const scenario of scenarios) {
    for (const agent of scenario.agentContributionSummary) {
      const current =
        map.get(agent.agentId) ??
        {
          agentId: agent.agentId,
          name: agent.name,
          alignment: [],
          confidence: [],
          totalOpinions: 0
        };
      current.alignment.push(agent.cioAlignmentRate);
      current.confidence.push(agent.averageConfidence);
      current.totalOpinions += agent.totalOpinions;
      map.set(agent.agentId, current);
    }
  }

  return [...map.values()]
    .map((agent) => {
      const averageAlignment = round(average(agent.alignment), 3);
      const averageConfidence = round(average(agent.confidence), 3);
      return {
        agentId: agent.agentId,
        name: agent.name,
        averageAlignment,
        averageConfidence,
        reason:
          mode === "increase"
            ? `${agent.name} aligned with CIO outcomes across the validation suite with calibrated confidence.`
            : `${agent.name} showed weaker CIO alignment or confidence calibration in the simulated sample.`,
        totalOpinions: agent.totalOpinions
      };
    })
    .filter((agent) =>
      mode === "increase"
        ? agent.totalOpinions > 0 && agent.averageAlignment >= 0.62 && agent.averageConfidence >= 0.5
        : agent.totalOpinions > 0 && (agent.averageAlignment < 0.45 || agent.averageConfidence < 0.42)
    )
    .sort((a, b) =>
      mode === "increase"
        ? b.averageAlignment + b.averageConfidence - (a.averageAlignment + a.averageConfidence)
        : a.averageAlignment + a.averageConfidence - (b.averageAlignment + b.averageConfidence)
    )
    .map(({ totalOpinions: _totalOpinions, ...agent }) => agent);
};

const weakRulesFor = (scenarios: ValidationScenarioResult[]) => {
  const weakRules: string[] = [];
  const conservative = scenarios.find((scenario) => scenario.id === "conservative-confluence");
  const aggressive = scenarios.find((scenario) => scenario.id === "aggressive-confluence");
  const london = scenarios.find((scenario) => scenario.id === "london-only");
  const nyAm = scenarios.find((scenario) => scenario.id === "ny-am-only");
  const longOnly = scenarios.find((scenario) => scenario.id === "long-only");
  const shortOnly = scenarios.find((scenario) => scenario.id === "short-only");
  const swingStop = scenarios.find((scenario) => scenario.id === "swing-stop");
  const fvgStop = scenarios.find((scenario) => scenario.id === "fvg-invalidation");
  const highConfidence = scenarios.find((scenario) => scenario.id === "high-confidence-only");
  const totalTrades = scenarios.reduce((sum, scenario) => sum + scenario.totalTrades, 0);
  const totalSkipped = scenarios.reduce((sum, scenario) => sum + scenario.skippedSignals, 0);
  const averageCalibration = average(scenarios.map((scenario) => scenario.confidenceCalibration.score));

  if (conservative && aggressive && aggressive.score > conservative.score + 15) {
    weakRules.push("Conservative confluence filtering underperformed the aggressive threshold in mock replay.");
  }
  if (fvgStop && swingStop && fvgStop.averageR < swingStop.averageR - 0.15) {
    weakRules.push("FVG invalidation stops underperformed latest-swing stops in simulated outcomes.");
  }
  if (london && nyAm && london.score + 12 < nyAm.score) {
    weakRules.push("London-only filtering was materially weaker than the NY AM validation slice.");
  }
  if (longOnly && shortOnly && Math.abs(longOnly.score - shortOnly.score) > 20) {
    weakRules.push("Directional bias calibration is uneven between long-only and short-only scenarios.");
  }
  if (highConfidence && highConfidence.totalTrades === 0) {
    weakRules.push("High-confidence filtering removed every simulated thesis and needs more calibration.");
  }
  if (totalSkipped > totalTrades * 1.5) {
    weakRules.push("Thresholds and session filters skipped more signals than they accepted across validation.");
  }
  if (averageCalibration < 0.55) {
    weakRules.push("Confidence scores are not yet well calibrated against simulated hit rate.");
  }

  return weakRules.length
    ? weakRules
    : ["No single ICT rule failed decisively in this small mock dataset; expand validation before broker-demo planning."];
};

const readinessFor = (scenarios: ValidationScenarioResult[]): Pick<CalibrationReport, "readinessScore" | "readinessStatus" | "recommendedNextStep"> => {
  const conservative = scenarios.find((scenario) => scenario.id === "conservative-confluence");
  const greenCount = scenarios.filter((scenario) => scenario.readiness === "green").length;
  const yellowOrGreenCount = scenarios.filter((scenario) => scenario.readiness !== "red").length;
  const readinessScore = round(average(scenarios.map((scenario) => scenario.score)), 0);
  const conservativePassed = conservative?.readiness === "green";

  if (conservativePassed && greenCount >= 3 && readinessScore >= 62) {
    return {
      readinessScore,
      readinessStatus: "green",
      recommendedNextStep:
        "Continue simulation validation with larger mock samples and walk-forward splits before any paper-demo bridge implementation."
    };
  }

  if (yellowOrGreenCount >= 4 && readinessScore >= 45) {
    return {
      readinessScore,
      readinessStatus: "yellow",
      recommendedNextStep:
        "Keep broker demo disabled. Tune thresholds, review weak ICT rules, and rerun validation before paper-demo planning."
    };
  }

  return {
    readinessScore,
    readinessStatus: "red",
    recommendedNextStep:
      "Not ready for broker demo. Improve simulated calibration and collect stronger mock backtest evidence first."
  };
};

export function buildCalibrationReport(scenarios: ValidationScenarioResult[], generatedAt: string): CalibrationReport {
  const sorted = [...scenarios].sort(byScoreDesc);
  const strongestScenario = sorted[0];
  const weakestScenario = sorted[sorted.length - 1];
  const sessionBest = bestByCategory(scenarios, "session");
  const sessionWorst = worstByCategory(scenarios, "session");
  const directionBest = bestByCategory(scenarios, "direction");
  const directionWorst = worstByCategory(scenarios, "direction");
  const source = thresholdSource(scenarios);
  const readiness = readinessFor(scenarios);

  return {
    strongestScenario: labelOrFallback(strongestScenario),
    weakestScenario: labelOrFallback(weakestScenario),
    bestSession: labelOrFallback(sessionBest),
    worstSession: labelOrFallback(sessionWorst),
    bestBiasDirection: labelOrFallback(directionBest),
    worstBiasDirection: labelOrFallback(directionWorst),
    recommendedConfluenceThreshold: round(source?.config.minimumConfluenceThreshold ?? 0.35, 2),
    recommendedConfidenceThreshold: round(source?.config.minimumConfidenceThreshold ?? 0.42, 2),
    agentWeightsToIncrease: recommendationForAgents(scenarios, "increase"),
    agentWeightsToDecrease: recommendationForAgents(scenarios, "decrease"),
    weakICTRules: weakRulesFor(scenarios),
    ...readiness,
    generatedAt
  };
}

export function saveLatestValidationReport(report: ValidationSuiteReport) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(VALIDATION_REPORT_STORAGE_KEY, JSON.stringify(report));
  window.dispatchEvent(new CustomEvent(VALIDATION_REPORT_UPDATED_EVENT, { detail: report }));
}

export function loadLatestValidationReport(): ValidationSuiteReport | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = window.localStorage.getItem(VALIDATION_REPORT_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as ValidationSuiteReport;
  } catch {
    return undefined;
  }
}
