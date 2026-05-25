import type { ResearchQualityReview } from "@/lib/researchQuality";
import {
  getLLMReadinessImpact,
  isLLMAdvisoryReviewPassed,
  latestLLMAdvisoryRun,
  loadLLMResearchState
} from "@/lib/llm/llmProvider";
import { countCompletedRunbookItems, simulationRunbookChecklist } from "@/lib/simulationRunbook";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import type { ValidationScenarioResult, ValidationSuiteReport } from "@/lib/validation";
import type { ReadinessGateSnapshot, ReadinessRequirementResult, ReadinessState } from "@/lib/readiness/readinessTypes";

const nowId = (prefix: string) => `${prefix}_${Date.now()}`;

const requirement = (
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  severity: ReadinessRequirementResult["severity"] = "blocker",
  debug: {
    currentValue: string;
    requiredValue: string;
    explanation: string;
    suggestedFix: string;
    runPage?: ReadinessRequirementResult["runPage"];
  }
): ReadinessRequirementResult => ({ id, label, passed, detail, severity, ...debug });

const conservativeScenarioFor = (validation?: ValidationSuiteReport) =>
  validation?.scenarios.find((scenario) => scenario.id === "conservative-confluence");

const averageCalibrationFor = (validation?: ValidationSuiteReport) => {
  if (!validation?.scenarios.length) {
    return 0;
  }
  return (
    validation.scenarios.reduce((sum, scenario) => sum + scenario.confidenceCalibration.score, 0) /
    validation.scenarios.length
  );
};

const maxDrawdownFor = (validation?: ValidationSuiteReport) =>
  validation?.scenarios.reduce((max, scenario) => Math.max(max, scenario.maxDrawdown), 0) ?? 0;

const sessionConsistencyPassed = (quality?: ResearchQualityReview) => {
  if (!quality?.sessionComparison.length) {
    return false;
  }
  const viableSessions = quality.sessionComparison.filter(
    (session) => session.readiness !== "red" && session.totalTrades > 0 && session.averageR >= -0.1
  );
  return viableSessions.length > 0;
};

const falsePositiveTotal = (quality?: ResearchQualityReview) =>
  quality?.falsePositivePatterns.reduce((sum, item) => sum + item.estimatedFalsePositives, 0) ?? 0;

const redDrawdownClusters = (quality?: ResearchQualityReview) =>
  quality?.drawdownClusters.filter((cluster) => cluster.clusterRisk === "red").length ?? 0;

const runbookComplete = (runbook?: SimulationRunbookState) =>
  Boolean(
    runbook?.verifiedAt &&
      countCompletedRunbookItems(runbook) === simulationRunbookChecklist.length &&
      runbook.checklist.brokerExecutionSkipped &&
      runbook.checklist.positionsZero &&
      runbook.checklist.tradesZero &&
      runbook.checklist.shutdownComplete
  );

const conservativeStabilityPassed = (conservative?: ValidationScenarioResult) =>
  Boolean(
    conservative &&
      conservative.readiness === "green" &&
      conservative.totalTrades >= 5 &&
      conservative.averageR >= 0.15 &&
      conservative.maxDrawdown <= 4
  );

const stateFor = (requirements: ReadinessRequirementResult[], validation?: ValidationSuiteReport, quality?: ResearchQualityReview): ReadinessState => {
  if (requirements.every((item) => item.passed)) {
    return "Paper-Demo Candidate";
  }
  if (validation && quality && quality.readinessGrade !== "Not Ready") {
    return "Research Ready";
  }
  return "Not Ready";
};

const nextStepFor = (state: ReadinessState, failed: ReadinessRequirementResult[]) => {
  if (state === "Paper-Demo Candidate") {
    return "Manual approval can be recorded, but broker execution remains disabled until a separate future implementation.";
  }
  if (state === "Research Ready") {
    return "Resolve failed blocker checks, rerun validation, and repeat research quality review before demo approval.";
  }
  const firstFailure = failed[0]?.label ?? "validation evidence";
  return `Blocked. Fix ${firstFailure.toLowerCase()} before considering paper-demo readiness.`;
};

const validationSnapshotFor = (validation?: ValidationSuiteReport) => {
  const conservative = conservativeScenarioFor(validation);
  if (!validation) {
    return undefined;
  }
  return {
    id: validation.id,
    generatedAt: validation.generatedAt,
    readinessStatus: validation.calibration.readinessStatus,
    readinessScore: validation.calibration.readinessScore,
    conservativeScenario: conservative
      ? {
          readiness: conservative.readiness,
          totalTrades: conservative.totalTrades,
          averageR: conservative.averageR,
          maxDrawdown: conservative.maxDrawdown,
          confidenceCalibration: conservative.confidenceCalibration.score
        }
      : undefined
  };
};

const researchQualitySnapshotFor = (quality?: ResearchQualityReview) =>
  quality
    ? {
        id: quality.id,
        generatedAt: quality.generatedAt,
        readinessGrade: quality.readinessGrade,
        readinessScore: quality.readinessScore,
        falsePositiveCount: falsePositiveTotal(quality),
        redDrawdownClusters: redDrawdownClusters(quality)
      }
    : undefined;

const runbookSnapshotFor = (runbook?: SimulationRunbookState) =>
  runbook
    ? {
        verifiedAt: runbook.verifiedAt,
        completedChecks: countCompletedRunbookItems(runbook),
        totalChecks: simulationRunbookChecklist.length,
        brokerExecutionSkipped: runbook.checklist.brokerExecutionSkipped,
        positionsZero: runbook.checklist.positionsZero,
        tradesZero: runbook.checklist.tradesZero,
        shutdownComplete: runbook.checklist.shutdownComplete
      }
    : undefined;

const llmSnapshotFor = () => {
  const state = loadLLMResearchState();
  const latest = latestLLMAdvisoryRun(state);
  return {
    latestRunAt: latest?.timestamp,
    providerMode: state.providerMode,
    providerConfigured: Boolean(latest?.providerConfigured),
    advisoryPassed: isLLMAdvisoryReviewPassed(state),
    unsafeResponseRejections: state.unsafeResponseRejections,
    readinessImpact: getLLMReadinessImpact(state)
  };
};

export function evaluateReadinessGate({
  validation,
  quality,
  runbook
}: {
  validation?: ValidationSuiteReport;
  quality?: ResearchQualityReview;
  runbook?: SimulationRunbookState;
}): ReadinessGateSnapshot {
  const conservative = conservativeScenarioFor(validation);
  const maxDrawdown = maxDrawdownFor(validation);
  const averageCalibration = averageCalibrationFor(validation);
  const falsePositives = falsePositiveTotal(quality);
  const redClusters = redDrawdownClusters(quality);
  const llmSnapshot = llmSnapshotFor();
  const requirements: ReadinessRequirementResult[] = [
    requirement(
      "validation-exists",
      "Latest validation results exist",
      Boolean(validation),
      validation?.generatedAt ?? "No validation suite has been run.",
      "blocker",
      {
        currentValue: validation?.generatedAt ?? "missing",
        requiredValue: "completed validation suite",
        explanation: "The gate needs a current validation suite before it can judge strategy stability.",
        suggestedFix: "Run the validation suite on /validation.",
        runPage: "/validation"
      }
    ),
    requirement(
      "research-quality-exists",
      "Latest research quality review exists",
      Boolean(quality),
      quality?.generatedAt ?? "No research quality review has been run.",
      "blocker",
      {
        currentValue: quality?.generatedAt ?? "missing",
        requiredValue: "completed research quality review",
        explanation: "The gate needs the quality review to identify false positives, weak sessions, and readiness grade.",
        suggestedFix: "Run Research Quality after validation is complete.",
        runPage: "/research-quality"
      }
    ),
    requirement(
      "quality-candidate",
      "Research Quality is Paper-Demo Candidate",
      quality?.readinessGrade === "Paper-Demo Candidate",
      quality ? `Current grade: ${quality.readinessGrade}.` : "Research quality review is missing.",
      "blocker",
      {
        currentValue: quality?.readinessGrade ?? "missing",
        requiredValue: "Paper-Demo Candidate",
        explanation: "Paper-demo candidate status can only come from the strict research quality review.",
        suggestedFix: quality ? "Resolve the quality review weaknesses, rerun validation, then rerun research quality." : "Run /research-quality after /validation.",
        runPage: quality ? "/validation" : "/research-quality"
      }
    ),
    requirement(
      "llm-advisory-review",
      "LLM advisory review passed through a configured provider",
      llmSnapshot.advisoryPassed,
      llmSnapshot.latestRunAt
        ? `Latest LLM run ${llmSnapshot.latestRunAt}; provider=${llmSnapshot.providerMode}; passed=${llmSnapshot.advisoryPassed}.`
        : "No configured LLM advisory run has passed.",
      "blocker",
      {
        currentValue: llmSnapshot.latestRunAt
          ? `${llmSnapshot.providerMode}; configured=${llmSnapshot.providerConfigured}; passed=${llmSnapshot.advisoryPassed}`
          : "missing",
        requiredValue: "configured real provider run passed with zero unsafe response rejections",
        explanation:
          "Real research mode requires LLM advisory review before Paper-Demo Candidate. Deterministic fallback and mock LLM runs are not sufficient.",
        suggestedFix:
          "Configure a secure local command, backend endpoint, Supabase Edge Function, or future provider service, then run /llm-agents.",
        runPage: "/llm-agents"
      }
    ),
    requirement(
      "runbook-complete",
      "Simulation runbook passed with broker execution skipped",
      runbookComplete(runbook),
      runbook
        ? `${countCompletedRunbookItems(runbook)}/${simulationRunbookChecklist.length} checks complete; broker skipped=${runbook.checklist.brokerExecutionSkipped}.`
        : "Simulation runbook is missing.",
      "blocker",
      {
        currentValue: runbook
          ? `${countCompletedRunbookItems(runbook)}/${simulationRunbookChecklist.length}; broker skipped=${runbook.checklist.brokerExecutionSkipped}`
          : "missing",
        requiredValue: `${simulationRunbookChecklist.length}/${simulationRunbookChecklist.length}; broker skipped=true; positions=0; trades=0`,
        explanation: "The app must prove the AI Lab to go-trader bridge was simulation-only and produced zero executed trades.",
        suggestedFix: "Complete every item in /simulation-runbook after a scheduler one-cycle simulation run.",
        runPage: "/simulation-runbook"
      }
    ),
    requirement(
      "drawdown-threshold",
      "Drawdown threshold passed",
      Boolean(validation) && maxDrawdown <= 4 && redClusters === 0,
      `Max validation drawdown ${maxDrawdown.toFixed(2)}R; red drawdown clusters ${redClusters}.`,
      "blocker",
      {
        currentValue: `${maxDrawdown.toFixed(2)}R max DD; ${redClusters} red clusters`,
        requiredValue: "max DD <= 4.00R and red clusters = 0",
        explanation: "Large drawdown or clustered losses block candidate status even if some scenarios look profitable.",
        suggestedFix: "Use Backtest Lab to increase confluence/confidence, reduce sessions, or compare stop models.",
        runPage: "/backtest-lab"
      }
    ),
    requirement(
      "confidence-calibration",
      "Confidence calibration passed",
      Boolean(validation) && averageCalibration >= 0.55 && (conservative?.confidenceCalibration.score ?? 0) >= 0.55,
      `Average calibration ${Math.round(averageCalibration * 100)}%; conservative calibration ${Math.round(
        (conservative?.confidenceCalibration.score ?? 0) * 100
      )}%.`,
      "blocker",
      {
        currentValue: `average ${Math.round(averageCalibration * 100)}%; conservative ${Math.round(
          (conservative?.confidenceCalibration.score ?? 0) * 100
        )}%`,
        requiredValue: "average >= 55% and conservative >= 55%",
        explanation: "Confidence must roughly match simulated outcomes; overconfident weak signals stay blocked.",
        suggestedFix: "Raise confidence/confluence thresholds, rerun validation, and check calibration again.",
        runPage: "/validation"
      }
    ),
    requirement(
      "false-positive-control",
      "False positives are controlled",
      Boolean(quality) && falsePositives <= 2 && (quality?.falsePositivePatterns.length ?? 99) <= 2,
      `Estimated false positives ${falsePositives}; patterns ${quality?.falsePositivePatterns.length ?? 0}.`,
      "blocker",
      {
        currentValue: `${falsePositives} estimated; ${quality?.falsePositivePatterns.length ?? 0} patterns`,
        requiredValue: "estimated <= 2 and patterns <= 2",
        explanation: "Too many false positives means the strategy is still accepting fragile theses.",
        suggestedFix: "Review false-positive patterns in /research-quality and tune one variable at a time in Backtest Lab.",
        runPage: "/research-quality"
      }
    ),
    requirement(
      "session-consistency",
      "Session consistency passed",
      sessionConsistencyPassed(quality),
      quality?.sessionComparison.length
        ? quality.sessionComparison.map((session) => `${session.session}: ${session.readiness}, ${session.averageR.toFixed(2)}R`).join("; ")
        : "No session comparison is available.",
      "blocker",
      {
        currentValue: quality?.sessionComparison.length
          ? quality.sessionComparison.map((session) => `${session.session}: ${session.readiness}, ${session.averageR.toFixed(2)}R`).join("; ")
          : "missing",
        requiredValue: "at least one non-red session with trades and avg R >= -0.10",
        explanation: "The gate needs at least one session window that is not obviously unstable.",
        suggestedFix: "Compare NY AM vs London in Backtest Lab, then rerun validation and research quality.",
        runPage: "/backtest-lab"
      }
    ),
    requirement(
      "conservative-stability",
      "Conservative scenario stability passed",
      conservativeStabilityPassed(conservative),
      conservative
        ? `Readiness ${conservative.readiness}; trades ${conservative.totalTrades}; average R ${conservative.averageR.toFixed(2)}; max DD ${conservative.maxDrawdown.toFixed(2)}R.`
        : "Conservative scenario is missing.",
      "blocker",
      {
        currentValue: conservative
          ? `${conservative.readiness}; ${conservative.totalTrades} trades; ${conservative.averageR.toFixed(2)} avg R; ${conservative.maxDrawdown.toFixed(2)}R DD`
          : "missing",
        requiredValue: "green; >= 5 trades; avg R >= 0.15; max DD <= 4.00R",
        explanation: "Aggressive settings are not enough; conservative validation must remain stable.",
        suggestedFix: "Use conservative thresholds as the benchmark and rerun /validation.",
        runPage: "/validation"
      }
    )
  ];

  const failedRequirements = requirements.filter((item) => !item.passed);
  const passedRequirements = requirements.filter((item) => item.passed);
  const state = stateFor(requirements, validation, quality);
  const warnings = [
    "Simulation-only readiness gating. Broker execution remains disabled.",
    "Manual approval records readiness intent only; it does not enable live or paper broker execution.",
    state !== "Paper-Demo Candidate"
      ? "Progression is blocked until every required check passes."
      : "Separate future broker-demo implementation and risk controls are still required."
  ];

  return {
    id: nowId("readiness_gate"),
    evaluatedAt: new Date().toISOString(),
    state,
    passedRequirements,
    failedRequirements,
    warnings,
    recommendedNextStep: nextStepFor(state, failedRequirements),
    brokerExecutionDisabled: true,
    validationSnapshot: validationSnapshotFor(validation),
    researchQualitySnapshot: researchQualitySnapshotFor(quality),
    runbookSnapshot: runbookSnapshotFor(runbook),
    llmSnapshot
  };
}

export function summarizeScenarioForGate(scenario?: ValidationScenarioResult) {
  if (!scenario) {
    return "missing";
  }
  return `${scenario.name}: ${scenario.readiness}, ${scenario.totalTrades} trades, ${scenario.averageR.toFixed(2)}R avg, ${scenario.maxDrawdown.toFixed(2)}R DD`;
}
