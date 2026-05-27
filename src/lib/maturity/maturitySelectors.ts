import type { ResearchMaturityGrade, ResearchMaturitySummary } from "@/lib/maturity/researchMaturityTypes";

export const maturityGradeLabel = (grade?: ResearchMaturityGrade) =>
  (grade ?? "untested").replace(/_/g, " ");

export const maturityGradeVariant = (grade?: ResearchMaturityGrade) =>
  grade === "paper_demo_candidate_review" || grade === "robust_research"
    ? "success"
    : grade === "research_ready" || grade === "early_research"
      ? "warning"
      : "danger";

export const maturityScoreVariant = (score?: number) =>
  typeof score !== "number" ? "muted" : score >= 70 ? "success" : score >= 40 ? "warning" : "danger";

export const selectMaturityReadinessWarning = (summary?: ResearchMaturitySummary) => {
  if (!summary) {
    return "Research maturity has not been evaluated yet.";
  }
  if (summary.grade === "paper_demo_candidate_review" || summary.grade === "robust_research") {
    return "Research maturity is improving, but still cannot approve execution.";
  }
  return "Research maturity insufficient for Paper-Demo Candidate.";
};

export const selectMaturityNextRequirement = (summary?: ResearchMaturitySummary) =>
  summary?.nextMaturityRequirement ?? "Run repeated AI Research Cycles to establish maturity.";
