import type { ResearchDecisionLogEntry } from "@/lib/researchDecisionLog";
import { safeTopN } from "@/lib/utils";

export interface ResearchReadinessDistinction {
  researchReady: boolean;
  paperDemoCandidate: boolean;
  researchReadyLabel: "yes" | "no";
  paperDemoCandidateLabel: "yes" | "no";
  paperDemoBlocker: string;
  evidenceScore: number | null;
  maturityScore: number | null;
  walkForwardStatus: string;
  confidenceAdjustmentNote: string;
  riskChairSummary: string;
  recommendedNextWork: string[];
  advisoryNotice: "Advisory-only. Does not change readiness.";
  confidenceNotice: "Confidence adjustment is explanatory only.";
}

const pct = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";

const compact = (values: Array<string | undefined | null>, fallback: string, max = 6) => {
  const unique = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
  return unique.length ? safeTopN(unique, max) : [fallback];
};

const walkForwardStatusFor = (entry: ResearchDecisionLogEntry) => {
  if (!entry.walkForward) {
    return "unavailable";
  }
  if (entry.walkForward.verdict) {
    return entry.walkForward.verdict.replace(/_/g, " ");
  }
  if (entry.walkForward.windowsTested > 0) {
    return `${entry.walkForward.outOfSampleWindowsPassed}/${entry.walkForward.windowsTested} OOS windows passed`;
  }
  return "unavailable";
};

const confidenceNoteFor = (entry: ResearchDecisionLogEntry) => {
  const thesis = entry.ictThesis;
  const confidence = pct(thesis?.confidence);
  const regime = [entry.regime.label, entry.regime.dataQuality].filter(Boolean).join(" / ").replace(/_/g, " ");
  const highVolOrTransition =
    entry.regime.label.includes("high_vol") ||
    entry.regime.label.includes("transition") ||
    entry.regime.missingInputs.length > 0;
  const hasThesisSignal = Boolean(
    thesis && (thesis.bias || thesis.ictBias || typeof thesis.confidence === "number")
  );

  if (thesis && hasThesisSignal) {
    const bias = thesis.bias ?? thesis.ictBias ?? "active thesis";
    return highVolOrTransition
      ? `CIO thesis ${bias} at ${confidence}; ${regime || "current regime"} should cap confidence until evidence and walk-forward improve.`
      : `CIO thesis ${bias} at ${confidence}; confidence adjustments remain explanatory only.`;
  }

  return highVolOrTransition
    ? `${regime || "Current regime"} should cap confidence until evidence and walk-forward improve.`
    : "No advisory confidence adjustment is recorded; any confidence adjustment is explanatory only.";
};

export function buildResearchReadinessDistinction(entry: ResearchDecisionLogEntry): ResearchReadinessDistinction {
  const researchReady = entry.readiness.state === "Research Ready" || entry.readiness.state === "Paper-Demo Candidate";
  const paperDemoCandidate = entry.readiness.state === "Paper-Demo Candidate";
  const evidenceScore = entry.quality.evidenceScore;
  const maturityScore = entry.quality.maturityScore;
  const walkForwardStatus = walkForwardStatusFor(entry);
  const blockers = compact(
    [
      ...entry.readiness.blockers,
      ...entry.blockers,
      evidenceScore !== null && evidenceScore < 60 ? `Evidence score ${evidenceScore}/100 is below Paper-Demo Candidate quality.` : undefined,
      maturityScore !== null && maturityScore < 60 ? `Maturity score ${maturityScore}/100 is below Paper-Demo Candidate maturity.` : undefined,
      !entry.walkForward ? "Walk-forward unavailable." : undefined,
      entry.walkForward?.verdict && !["robust_research", "paper_demo_review_candidate"].includes(entry.walkForward.verdict)
        ? `Walk-forward verdict is ${entry.walkForward.verdict.replace(/_/g, " ")}.`
        : undefined,
      entry.source.provider === "mt5_read_only" ? "Source is MT5 read-only CFD/proxy data, not CME futures broker truth." : undefined
    ],
    "Paper-Demo Candidate requires evidence, maturity, walk-forward, and advisory gates to clear."
  );
  const paperDemoBlocker = paperDemoCandidate ? "No Paper-Demo Candidate blocker is recorded in the latest decision log." : blockers[0];
  const recommendedNextWork = paperDemoCandidate
    ? ["Maintain evidence, maturity, walk-forward, and safety records before any external review."]
    : [
        "Improve evidence quality coverage.",
        "Run or extend walk-forward depth.",
        "Complete the simulation runbook evidence.",
        "Stabilize conservative validation scenarios."
      ];

  return {
    researchReady,
    paperDemoCandidate,
    researchReadyLabel: researchReady ? "yes" : "no",
    paperDemoCandidateLabel: paperDemoCandidate ? "yes" : "no",
    paperDemoBlocker,
    evidenceScore,
    maturityScore,
    walkForwardStatus,
    confidenceAdjustmentNote: confidenceNoteFor(entry),
    riskChairSummary: paperDemoCandidate
      ? "Risk Chair: Paper-Demo Candidate review is allowed by the current research gates, but execution remains disabled."
      : researchReady
        ? "Risk Chair: Research Ready, but not Paper-Demo Candidate. Continue research and collect more evidence."
        : "Risk Chair: Not Research Ready. Continue deterministic research before candidate review.",
    recommendedNextWork,
    advisoryNotice: "Advisory-only. Does not change readiness.",
    confidenceNotice: "Confidence adjustment is explanatory only."
  };
}
