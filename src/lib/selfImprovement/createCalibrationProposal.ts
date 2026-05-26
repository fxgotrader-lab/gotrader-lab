import {
  defaultBacktestConfig,
  loadBacktestConfig,
  sanitizeBacktestConfig
} from "@/lib/backtesting";
import type {
  BacktestAgentWeights,
  BacktestConfig,
  BacktestSessionFilter,
  ResolvedBacktestConfig
} from "@/lib/backtesting/backtestTypes";
import { mockCandles } from "@/lib/mockData/mockCandles";
import {
  applyProposalChangesToConfig,
  summarizeValidationMetrics
} from "@/lib/selfImprovement/evaluateCalibrationProposal";
import { resolveActiveBacktestConfig } from "@/lib/selfImprovement/approveCalibrationProposal";
import type {
  CalibrationProposal,
  CalibrationProposalChanges,
  CalibrationProposalSource,
  CalibrationTargetProblem
} from "@/lib/selfImprovement/selfImprovementTypes";
import { uid } from "@/lib/utils";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { loadLatestValidationReport, runValidationSuite } from "@/lib/validation";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const sessionFilterFromScenario = (scenarioName?: string): BacktestSessionFilter | undefined => {
  if (!scenarioName) {
    return undefined;
  }
  if (scenarioName.includes("NY AM")) {
    return "NY AM Kill Zone";
  }
  if (scenarioName.includes("London")) {
    return "London";
  }
  if (scenarioName.includes("New York")) {
    return "New York";
  }
  if (scenarioName.includes("Asia")) {
    return "Asia";
  }
  return undefined;
};

const safeConfig = (config: BacktestConfig | ResolvedBacktestConfig) => sanitizeBacktestConfig(config);

const proposeAgentWeightChange = (config: ResolvedBacktestConfig): Partial<BacktestAgentWeights> => {
  const validation = loadLatestValidationReport();
  const decrease = validation?.calibration.agentWeightsToDecrease[0];
  const increase = validation?.calibration.agentWeightsToIncrease[0];
  const changes: Partial<BacktestAgentWeights> = {};

  if (decrease?.agentId && decrease.agentId in config.agentWeights) {
    const key = decrease.agentId as keyof BacktestAgentWeights;
    changes[key] = round(Math.max(0.05, config.agentWeights[key] - 0.04), 3);
  }
  if (increase?.agentId && increase.agentId in config.agentWeights) {
    const key = increase.agentId as keyof BacktestAgentWeights;
    changes[key] = round(Math.min(1.5, config.agentWeights[key] + 0.04), 3);
  }

  return changes;
};

const detectTargetProblem = (): CalibrationTargetProblem => {
  const validation = loadLatestValidationReport();
  const quality = loadLatestResearchQualityReview();
  const weaknessText = quality?.topWeaknesses.map((weakness) => `${weakness.title} ${weakness.detail}`).join(" ").toLowerCase() ?? "";
  const averageWinRate = validation
    ? validation.scenarios.reduce((sum, scenario) => sum + scenario.winRate, 0) / Math.max(1, validation.scenarios.length)
    : 0;
  const averageR = validation
    ? validation.scenarios.reduce((sum, scenario) => sum + scenario.averageR, 0) / Math.max(1, validation.scenarios.length)
    : 0;
  const maxDrawdown = validation ? Math.max(...validation.scenarios.map((scenario) => scenario.maxDrawdown)) : 0;
  const averageCalibration = validation
    ? validation.scenarios.reduce((sum, scenario) => sum + scenario.confidenceCalibration.score, 0) /
      Math.max(1, validation.scenarios.length)
    : 1;

  if (maxDrawdown > 4 || weaknessText.includes("drawdown")) {
    return "high_drawdown";
  }
  if ((quality?.falsePositivePatterns[0]?.estimatedFalsePositives ?? 0) > 0 || weaknessText.includes("false positive")) {
    return "false_positives";
  }
  if (averageWinRate > 0 && averageWinRate < 0.48) {
    return "low_win_rate";
  }
  if (averageR < 0.05 || weaknessText.includes("average r")) {
    return "weak_average_r";
  }
  if (averageCalibration < 0.55 || weaknessText.includes("confidence")) {
    return "poor_confidence_calibration";
  }
  if (weaknessText.includes("session") || weaknessText.includes("london") || weaknessText.includes("ny am")) {
    return "poor_session_performance";
  }
  if ((validation?.calibration.agentWeightsToDecrease.length ?? 0) > 0) {
    return "unstable_agent_weight";
  }
  return "overfitting_risk";
};

const proposedChangesFor = (
  targetProblem: CalibrationTargetProblem,
  config: ResolvedBacktestConfig
): CalibrationProposalChanges => {
  const validation = loadLatestValidationReport();
  const quality = loadLatestResearchQualityReview();
  const bestSession =
    sessionFilterFromScenario([...((quality?.sessionComparison) ?? [])].sort((a, b) => b.averageR - a.averageR)[0]?.scenarioName) ??
    sessionFilterFromScenario(validation?.calibration.bestSession);

  switch (targetProblem) {
    case "high_drawdown":
      return {
        confluenceThreshold: round(clamp01(config.minimumConfluenceThreshold + 0.07), 2),
        confidenceThreshold: round(clamp01(config.minimumConfidenceThreshold + 0.04), 2)
      };
    case "low_win_rate":
      return {
        confidenceThreshold: round(clamp01(config.minimumConfidenceThreshold + 0.06), 2)
      };
    case "weak_average_r":
      return {
        targetRMultiple: round(Math.min(3.5, config.targetRMultiple + 0.25), 2)
      };
    case "false_positives":
      return {
        confidenceThreshold: round(clamp01(config.minimumConfidenceThreshold + 0.08), 2)
      };
    case "poor_session_performance":
      return {
        sessionFilter: bestSession ?? "NY AM Kill Zone"
      };
    case "poor_confidence_calibration":
      return {
        confidenceThreshold: round(clamp01(config.minimumConfidenceThreshold + 0.05), 2)
      };
    case "unstable_agent_weight":
      return {
        agentWeights: proposeAgentWeightChange(config)
      };
    case "overfitting_risk":
    default:
      return {
        confluenceThreshold: round(clamp01(Math.max(config.minimumConfluenceThreshold, 0.5)), 2)
      };
  }
};

const reasonFor = (targetProblem: CalibrationTargetProblem) => {
  const quality = loadLatestResearchQualityReview();
  const topWeakness = quality?.topWeaknesses[0];
  if (topWeakness) {
    return `${topWeakness.title}: ${topWeakness.detail}`;
  }

  const validation = loadLatestValidationReport();
  if (validation) {
    return `Validation calibration flagged ${validation.calibration.weakestScenario} as the weakest scenario.`;
  }

  return `Internal proposal created because ${targetProblem.replace(/_/g, " ")} needs baseline simulation testing.`;
};

export function createCalibrationProposal(source: CalibrationProposalSource = "openclaw"): CalibrationProposal {
  const currentConfig = safeConfig(resolveActiveBacktestConfig().config ?? loadBacktestConfig() ?? defaultBacktestConfig);
  const validationReport = loadLatestValidationReport() ?? runValidationSuite(mockCandles, currentConfig);
  const beforeMetrics = summarizeValidationMetrics(validationReport);
  const targetProblem = detectTargetProblem();
  const proposedChanges = proposedChangesFor(targetProblem, currentConfig);
  const proposedConfig = applyProposalChangesToConfig(currentConfig, proposedChanges);

  return {
    proposalId: uid("calibration_proposal"),
    timestamp: new Date().toISOString(),
    source,
    status: "proposed",
    mode: "simulation",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    reason: reasonFor(targetProblem),
    targetProblem,
    proposedChanges,
    expectedImprovement:
      "Improve stability, drawdown behavior, confidence calibration, or scenario consistency without changing execution authority.",
    safetyNotes: [
      "Simulation-only proposal.",
      "No broker settings, execution permissions, readiness overrides, or paper/live trading modes can be changed.",
      "User approval is required before active simulation calibration settings are updated."
    ],
    beforeMetrics,
    baselineConfig: currentConfig,
    proposedConfig,
    approvalRequired: true
  };
}
