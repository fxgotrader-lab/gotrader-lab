import { compareRunFingerprints } from "@/lib/runtime/runFingerprint";
import type { MetricProvenance, RunFingerprint } from "@/lib/runtime/researchRuntimeTypes";

const formatNumber = (value: number) => value.toLocaleString();

export function createMetricProvenance(
  fingerprint: RunFingerprint,
  metricSourceLabel = fingerprint.label,
  compareWith?: RunFingerprint
): MetricProvenance {
  return {
    fingerprint,
    metricSourceLabel,
    rows: [
      ["Fingerprint", fingerprint.fingerprintId],
      ["Metric source type", fingerprint.metricSourceType],
      ["Run ID", fingerprint.runId ?? "none"],
      ["Cycle ID", fingerprint.cycleId ?? "none"],
      ["Proposal ID", fingerprint.proposalId ?? "none"],
      ["Source candidate ID", fingerprint.sourceCandidateId ?? "none"],
      ["Data source", fingerprint.dataSource],
      ["Symbol", fingerprint.symbol],
      ["Timeframe", fingerprint.timeframe],
      ["Raw candles", formatNumber(fingerprint.rawCandleCount)],
      ["Processed candles", formatNumber(fingerprint.processedCandleCount)],
      ["Candle window", fingerprint.candleWindow],
      ["Data preset", fingerprint.dataPreset],
      ["Active calibration ID", fingerprint.activeCalibrationId ?? "none"],
      ["Config merge status", fingerprint.configMergeStatus],
      ["LLM reviewer schema", fingerprint.llmReviewerSchemaVersion],
      ["LLM run ID", fingerprint.llmRunId ?? "none"],
      ["Generated at", fingerprint.generatedAt]
    ].map(([label, value]) => ({ label, value })),
    mismatchWarnings: compareRunFingerprints(fingerprint, compareWith)
  };
}

export const provenanceRows = (provenance?: MetricProvenance) => provenance?.rows ?? [];

export const provenanceWarnings = (...items: Array<MetricProvenance | undefined>) =>
  items.flatMap((item) => item?.mismatchWarnings ?? []);
