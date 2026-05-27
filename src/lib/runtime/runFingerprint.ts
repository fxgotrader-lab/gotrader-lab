import type { MetricSourceType, RunFingerprint, RuntimeDataPreset } from "@/lib/runtime/researchRuntimeTypes";

export const LLM_REVIEWER_SCHEMA_VERSION = "futures-context-reviewers-v1";

export interface RunFingerprintInput {
  runId?: string;
  cycleId?: string;
  proposalId?: string;
  sourceCandidateId?: string;
  dataSource: string;
  symbol: string;
  timeframe: string;
  rawCandleCount: number;
  processedCandleCount: number;
  candleWindow: string;
  dataPreset: RuntimeDataPreset;
  activeCalibrationId?: string;
  configMergeStatus: string;
  llmReviewerSchemaVersion?: string;
  llmRunId?: string;
  generatedAt: string;
  metricSourceType: MetricSourceType;
}

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const sourceLabelFor = (type: MetricSourceType) =>
  type === "latest_cycle"
    ? "latest cycle"
    : type === "proposal_snapshot"
      ? "proposal snapshot"
      : type === "active_baseline"
        ? "active baseline"
        : "recomputed preview";

export function createRunFingerprint(input: RunFingerprintInput): RunFingerprint {
  const identity = [
    input.metricSourceType,
    input.runId,
    input.cycleId,
    input.proposalId,
    input.sourceCandidateId,
    input.dataSource,
    input.symbol,
    input.timeframe,
    input.rawCandleCount,
    input.processedCandleCount,
    input.candleWindow,
    input.dataPreset,
    input.activeCalibrationId ?? "no-calibration",
    input.configMergeStatus,
    input.llmReviewerSchemaVersion ?? LLM_REVIEWER_SCHEMA_VERSION,
    input.llmRunId ?? "no-llm-run",
    input.generatedAt
  ].join("|");
  const fingerprintId = `fp_${hashString(identity)}`;
  const idLabel = input.cycleId ?? input.proposalId ?? input.runId ?? "no-run";
  const sourceLabel = sourceLabelFor(input.metricSourceType);

  return {
    ...input,
    fingerprintId,
    llmReviewerSchemaVersion: input.llmReviewerSchemaVersion ?? LLM_REVIEWER_SCHEMA_VERSION,
    label: `${sourceLabel} ${idLabel} / ${input.dataSource} / ${input.candleWindow}`,
    compactLabel: `${sourceLabel}: ${idLabel} / ${fingerprintId}`
  };
}

export const sameRunFingerprint = (left?: RunFingerprint, right?: RunFingerprint) =>
  Boolean(left && right && left.fingerprintId === right.fingerprintId);

export function compareRunFingerprints(left?: RunFingerprint, right?: RunFingerprint) {
  if (!left || !right || sameRunFingerprint(left, right)) {
    return [];
  }
  return ["Different run/source. Do not compare as the same test."];
}
