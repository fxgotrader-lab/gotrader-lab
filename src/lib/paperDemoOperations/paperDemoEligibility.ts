import type { PaperDemoChecklistSummary } from "@/lib/readiness";
import type { SourceStatusSnapshot } from "@/lib/sourceStatus";
import type { ValidationChainEntry } from "@/lib/validationChain";
import {
  PAPER_DEMO_AUTHORITY,
  type PaperDemoCandidate,
  type PaperDemoEligibilityResult
} from "./paperDemoTypes";

const hasNoneAuthority = (authority?: Partial<typeof PAPER_DEMO_AUTHORITY>) =>
  authority?.executionAuthority === "none" &&
  authority?.brokerAuthority === "none" &&
  authority?.readinessOverrideAuthority === "none";

const timestampToken = (value: string) => value.replace(/[^0-9a-z]/gi, "");

const replayIsSufficient = (candidate: PaperDemoCandidate) =>
  candidate.replayStatus === "passed" ||
  candidate.replayStatus === "sufficient" ||
  candidate.replayStatus === "replay_passed";

const walkForwardIsAllowed = (candidate: PaperDemoCandidate) =>
  candidate.walkForwardStatus === "passed" ||
  candidate.walkForwardStatus === "sufficient" ||
  candidate.walkForwardStatus === "walk_forward_passed" ||
  candidate.walkForwardStatus === "needs_more_data";

const summaryExists = (value?: string) =>
  Boolean(value && !["missing", "pending", "unavailable", "not_available", "none"].includes(value));

export function buildPaperDemoEligibility(candidate: PaperDemoCandidate): PaperDemoEligibilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [...candidate.warnings];

  if (candidate.sourceStatus === "mock_sample" || candidate.sourceProvider === "mock") {
    blockers.push("Source is mock/sample and cannot enter Paper-Demo Operations watchlist.");
  }
  if (!candidate.sourceFingerprint || candidate.sourceFingerprint === "no fingerprint") {
    blockers.push("Source fingerprint is missing.");
  }
  if (!candidate.validationChainId) {
    blockers.push("Validation chain is missing.");
  }
  if (!replayIsSufficient(candidate)) {
    blockers.push("Replay validation has not passed or been marked sufficient.");
  }
  if (!walkForwardIsAllowed(candidate)) {
    blockers.push("Walk-forward status is missing or failed.");
  } else if (candidate.walkForwardStatus === "needs_more_data") {
    warnings.push("Walk-forward needs more data; watchlist entry must stay conservative.");
  }
  if (!summaryExists(candidate.evidenceStatus)) {
    blockers.push("Evidence quality summary is missing.");
  }
  if (!summaryExists(candidate.maturityStatus)) {
    blockers.push("Research maturity summary is missing.");
  }
  if (!summaryExists(candidate.paperDemoChecklistStatus)) {
    blockers.push("Paper-Demo checklist summary is missing.");
  }
  if (!hasNoneAuthority(candidate.authority)) {
    blockers.push("Authority is not none/none/none.");
  }
  if (candidate.executionIntent !== "none") {
    blockers.push("Execution intent is not allowed in Paper-Demo Operations.");
  }

  const eligible = blockers.length === 0;
  return {
    candidateId: candidate.id,
    status: eligible ? (warnings.length ? "eligible_with_warning" : "eligible") : "blocked",
    eligible,
    blockers,
    warnings,
    nextAction: eligible
      ? "Add to watchlist, complete daily checklist, and monitor manually."
      : blockers[0] ?? "Resolve Paper-Demo Operations blockers.",
    authority: PAPER_DEMO_AUTHORITY
  };
}

export function buildPaperDemoCandidateFromContext({
  checklist,
  source,
  timestamp = new Date().toISOString(),
  validationChain
}: {
  checklist?: PaperDemoChecklistSummary;
  source?: SourceStatusSnapshot;
  timestamp?: string;
  validationChain?: ValidationChainEntry;
}): PaperDemoCandidate {
  const idSeed = validationChain?.recognitionId ?? source?.sourceFingerprint ?? timestamp;
  const sourceStatus = source?.sourceStatus ?? validationChain?.sourceStatus.statusLabel ?? "unavailable";
  const candidate: PaperDemoCandidate = {
    id: `paper_demo_candidate_${timestampToken(timestamp)}_${Math.abs(
      Array.from(idSeed).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
    ).toString(36)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    requestedSymbol: source?.requestedSymbol ?? validationChain?.symbol ?? "MNQ",
    brokerSymbol: source?.brokerSymbol ?? validationChain?.brokerSymbol,
    timeframe: source?.primaryTimeframe ?? validationChain?.timeframe ?? "5m",
    htfContext: source?.higherTimeframes ?? validationChain?.htfContext ?? [],
    sourceFingerprint: source?.sourceFingerprint ?? validationChain?.sourceFingerprint ?? "no fingerprint",
    sourceProvider: source?.sourceProvider ?? validationChain?.sourceStatus.sourceProvider ?? "unknown",
    sourceStatus,
    recognitionType: validationChain?.recognitionType ?? "unknown_structured_opportunity",
    setupName: validationChain?.setupLabel ?? "Current research setup",
    validationChainId: validationChain?.recognitionId,
    replayStatus: validationChain?.replayResult?.verdict ?? validationChain?.hypothesisStatus ?? "missing",
    walkForwardStatus: validationChain?.walkForwardResult?.verdict ?? validationChain?.hypothesisStatus ?? "missing",
    evidenceStatus: validationChain?.evidenceQuality ? "present" : "missing",
    maturityStatus: typeof validationChain?.evidenceQuality?.maturityScore === "number" ? "present" : "missing",
    paperDemoChecklistStatus: checklist ? (checklist.paperDemoCandidate ? "complete" : "partial") : "missing",
    blockers: validationChain?.blockers ?? [],
    warnings: source?.warningLabel ? [source.warningLabel] : [],
    operatorNotes: [],
    status: "draft",
    nextAction: validationChain?.nextAction ?? "Review validation chain before Paper-Demo Operations.",
    executionIntent: "none",
    authority: PAPER_DEMO_AUTHORITY
  };
  const eligibility = buildPaperDemoEligibility(candidate);
  return {
    ...candidate,
    blockers: eligibility.eligible ? candidate.blockers : [...candidate.blockers, ...eligibility.blockers],
    warnings: eligibility.warnings,
    status: eligibility.eligible ? "draft" : "blocked",
    nextAction: eligibility.nextAction
  };
}

export function toPaperDemoWatchlistStatus(candidate: PaperDemoCandidate): PaperDemoCandidate {
  const eligibility = buildPaperDemoEligibility(candidate);
  if (!eligibility.eligible) {
    return {
      ...candidate,
      status: "blocked",
      blockers: [...new Set([...candidate.blockers, ...eligibility.blockers])],
      warnings: eligibility.warnings,
      updatedAt: new Date().toISOString(),
      nextAction: eligibility.nextAction,
      authority: PAPER_DEMO_AUTHORITY,
      executionIntent: "none"
    };
  }
  return {
    ...candidate,
    status: "watchlist",
    updatedAt: new Date().toISOString(),
    nextAction: "Complete daily checklist and monitor manually.",
    authority: PAPER_DEMO_AUTHORITY,
    executionIntent: "none"
  };
}
