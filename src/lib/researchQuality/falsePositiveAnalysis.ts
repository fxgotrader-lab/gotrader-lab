import type { ValidationScenarioResult, ValidationSuiteReport } from "@/lib/validation";
import type { FalsePositivePattern } from "@/lib/researchQuality/researchQualityTypes";

const estimatedLossesFor = (scenario: ValidationScenarioResult) =>
  Math.max(0, scenario.totalTrades - Math.round(scenario.totalTrades * scenario.winRate));

const mitigationFor = (scenario: ValidationScenarioResult) => {
  if (scenario.confidenceCalibration.calibrationGap >= 0.25) {
    return "Raise the minimum confidence threshold or reduce CIO confidence when agent agreement is thin.";
  }
  if (scenario.averageR < 0) {
    return "Review invalidation distance and target placement before accepting similar simulated theses.";
  }
  if (scenario.winRate < 0.5) {
    return "Require stronger ICT confluence before this scenario can graduate from research.";
  }
  return "Keep as an observation and retest with a larger mock sample.";
};

const patternFor = (scenario: ValidationScenarioResult) => {
  if (scenario.id === "aggressive-confluence") {
    return "Loose confluence gates accepted lower-quality theses.";
  }
  if (scenario.id === "high-confidence-only") {
    return "High stated confidence did not fully remove losing simulated theses.";
  }
  if (scenario.category === "session") {
    return `${scenario.name} produced weaker session-specific confirmation.`;
  }
  if (scenario.category === "stop") {
    return `${scenario.name} exposed invalidation or target placement fragility.`;
  }
  return "Negative or poorly calibrated simulated theses appeared in this scenario.";
};

export function analyzeFalsePositivePatterns(report: ValidationSuiteReport): FalsePositivePattern[] {
  return report.scenarios
    .filter(
      (scenario) =>
        scenario.totalTrades > 0 &&
        (scenario.winRate < 0.5 ||
          scenario.averageR < 0 ||
          scenario.worstTradeR <= -0.75 ||
          scenario.confidenceCalibration.calibrationGap >= 0.2)
    )
    .map((scenario) => ({
      scenarioName: scenario.name,
      estimatedFalsePositives: estimatedLossesFor(scenario),
      winRate: scenario.winRate,
      averageConfidence: scenario.confidenceCalibration.averageConfidence,
      calibrationGap: scenario.confidenceCalibration.calibrationGap,
      worstR: scenario.worstTradeR,
      pattern: patternFor(scenario),
      mitigation: mitigationFor(scenario)
    }))
    .sort(
      (a, b) =>
        b.estimatedFalsePositives +
        b.calibrationGap +
        Math.abs(Math.min(0, b.worstR)) -
        (a.estimatedFalsePositives + a.calibrationGap + Math.abs(Math.min(0, a.worstR)))
    );
}
