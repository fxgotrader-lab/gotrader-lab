import type { EvidenceLedgerSummary, EvidenceSourceClass } from "@/lib/evidence/evidenceTypes";

export const evidenceSourceLabel = (sourceType: EvidenceSourceClass) => sourceType.replace(/_/g, " ");

export const evidenceSourceVariant = (sourceType: EvidenceSourceClass) =>
  sourceType === "real_imported" || sourceType === "derived_from_real"
    ? "success"
    : sourceType === "manual"
      ? "secondary"
      : sourceType === "mock" || sourceType === "planned"
        ? "warning"
        : "danger";

export const evidenceScoreVariant = (score?: number) =>
  typeof score !== "number"
    ? "muted"
    : score >= 75
      ? "success"
      : score >= 55
        ? "warning"
        : "danger";

export const selectEvidenceReadinessImpact = (summary?: EvidenceLedgerSummary) => {
  if (!summary) {
    return "Evidence quality has not been evaluated yet.";
  }
  return summary.readinessEvidenceWarnings[0] ?? "Evidence quality supports research monitoring, but cannot approve readiness by itself.";
};

export const selectWeakestEvidenceLabel = (summary?: EvidenceLedgerSummary) =>
  summary?.weakestEvidenceArea ? `${summary.weakestEvidenceArea.category} (${summary.weakestEvidenceArea.sourceType})` : "none";

export const selectStrongestEvidenceLabel = (summary?: EvidenceLedgerSummary) =>
  summary?.strongestRealEvidence ? `${summary.strongestRealEvidence.category} (${summary.strongestRealEvidence.qualityScore})` : "none";
