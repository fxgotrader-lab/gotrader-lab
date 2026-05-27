import type { EvidenceScoreInput, EvidenceSourceClass } from "@/lib/evidence/evidenceTypes";

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const evidenceSourceBaseScore: Record<EvidenceSourceClass, number> = {
  real_imported: 0.95,
  derived_from_real: 0.84,
  manual: 0.7,
  mock: 0.34,
  planned: 0.18,
  unavailable: 0.04
};

export function scoreEvidenceQuality(input: EvidenceScoreInput) {
  const score =
    evidenceSourceBaseScore[input.sourceType] * 0.36 +
    clamp01(input.completeness) * 0.24 +
    clamp01(input.freshness) * 0.14 +
    clamp01(input.reliability) * 0.16 +
    clamp01(input.coverage) * 0.1;

  return Math.round(clamp01(score) * 100);
}

export function evidenceQualityGrade(score: number) {
  if (score >= 80) {
    return "strong";
  }
  if (score >= 65) {
    return "usable";
  }
  if (score >= 45) {
    return "limited";
  }
  return "weak";
}
