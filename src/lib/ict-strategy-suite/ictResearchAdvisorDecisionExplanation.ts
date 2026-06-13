import type {
  IctResearchAdvisorDecisionExplanation,
  IctResearchAdvisorDecisionExplanationInput,
  IctResearchAdvisorDecisionSection,
  IctResearchAdvisorDecisionStatus
} from "./ictResearchAdvisorDecisionExplanationTypes";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const compact = (value?: string | number | boolean) => {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "n/a";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value?.toString().trim() || "n/a";
};

const token = (value?: string) => compact(value).replace(/_/g, " ");
const pct = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a");
const pctRaw = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "n/a");
const first = (...values: Array<string | undefined | null | false>) => values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
const firstList = (values?: string[]) => values?.find((value) => value.trim().length > 0);
const unique = (values: Array<string | undefined | null | false>) => Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
const isCmd = (modelName?: string) => modelName === "consolidation_manipulation_distribution";
const htfFrames = ["W1", "D1", "H4", "H1", "M15", "M5"] as const;

const section = (
  id: IctResearchAdvisorDecisionSection["id"],
  label: string,
  status: IctResearchAdvisorDecisionStatus,
  reason: string,
  nextAction: string,
  facts: Array<string | undefined | null | false> = []
): IctResearchAdvisorDecisionSection => ({
  id,
  label,
  status,
  reason,
  nextAction,
  facts: unique(facts)
});

const laneReasonFor = ({ currentRead, researchSignal }: IctResearchAdvisorDecisionExplanationInput) => {
  const reason = first(
    firstList(currentRead.topReasons),
    firstList(researchSignal.rejectionReasons),
    firstList(currentRead.opportunityBlockers),
    firstList(currentRead.opportunityMissingEvidence),
    firstList(currentRead.modelMissingEvidence),
    currentRead.paperWatchlistReason,
    researchSignal.reasons[0],
    "Approved-profile lane is not currently satisfied."
  );
  if (currentRead.modelQualityLane === "rejected") return `Lane rejected because ${reason}`;
  if (currentRead.modelQualityLane === "no_trade") return `Lane is No Trade because ${reason}`;
  if (currentRead.modelQualityLane === "watchlist") return `Lane is Watchlist because ${reason}`;
  if (currentRead.modelQualityLane === "paper_watchlist") return `Lane is Paper Watchlist because ${reason}`;
  return `Lane is Approved because ${reason}`;
};

const paperSimReasonFor = ({ currentRead, researchSignal }: IctResearchAdvisorDecisionExplanationInput) => {
  if (currentRead.paperSimAllowed || researchSignal.paperSimAllowed) {
    return "Paper Sim eligible because the current signal is an approved research signal or explicit paper-watchlist candidate.";
  }
  return `Paper Sim not eligible because ${first(
    currentRead.paperSimEligibilityReason,
    firstList(researchSignal.rejectionReasons),
    firstList(researchSignal.reasons),
    "only approved research signals or explicit paper-watchlist candidates are eligible."
  )}`;
};

const cmdPaperReasonFor = ({ currentRead, researchSignal, cmdPaperTracking }: IctResearchAdvisorDecisionExplanationInput) => {
  if (cmdPaperTracking) {
    return `CMD Paper tracking is ${token(cmdPaperTracking.state)} with outcome ${token(cmdPaperTracking.outcome)}.`;
  }
  if (!isCmd(currentRead.modelName ?? researchSignal.modelName)) {
    return `CMD Paper not eligible - current model is ${token(currentRead.modelName ?? researchSignal.modelName ?? "none")}.`;
  }
  if (currentRead.modelQualityLane !== "paper_watchlist" || currentRead.approvedStatus !== "paper_watchlist_candidate") {
    return `CMD Paper not eligible because lane is ${token(currentRead.modelQualityLane)} and profile status is ${token(currentRead.approvedStatus)}. ${first(
      currentRead.paperWatchlistReason,
      firstList(researchSignal.rejectionReasons),
      "Strict CMD paper-watchlist gates did not pass."
    )}`;
  }
  if (currentRead.cmdIndependentDateGateRequired && currentRead.cmdIndependentDateGateStatus !== "passed") {
    return `CMD is promising as paper-only research, but Paper-Demo promotion is blocked: ${currentRead.cmdIndependentDateGateReason ?? "independent-date validation is required."}`;
  }
  return `CMD Paper eligible for research-only tracking because CMD is a paper-watchlist candidate. ${currentRead.paperWatchlistReason ?? "Paper-only tracking can be created manually."}`;
};

const htfAlignmentStatusFor = ({ currentRead }: IctResearchAdvisorDecisionExplanationInput): IctResearchAdvisorDecisionStatus => {
  const status = currentRead.htfAlignment?.alignmentStatus;
  if (status === "aligned" || status === "not_required_for_model") return "ready";
  if (status === "partially_aligned" || status === "mixed") return "warning";
  if (status === "conflicted") return currentRead.htfAlignment?.modelAllowance === "soft_warning" ? "warning" : "rejected";
  return "missing";
};

const htfAlignmentReasonFor = ({ currentRead }: IctResearchAdvisorDecisionExplanationInput) => {
  const alignment = currentRead.htfAlignment;
  if (!alignment) {
    return "HTF alignment unavailable because the current read did not include compact W1/D1/H4/H1/M15/M5 direction context.";
  }
  if (alignment.alignmentStatus === "aligned") {
    return `HTF alignment is aligned. ${alignment.conflictReason}`;
  }
  if (alignment.modelAllowance === "soft_warning") {
    return `HTF alignment is a research-only warning: ${alignment.conflictReason} ${alignment.modelAllowanceReason}`;
  }
  if (alignment.modelAllowance === "not_required") {
    return `HTF alignment is not required for this model state. ${alignment.modelAllowanceReason}`;
  }
  return `HTF alignment blocks this setup: ${alignment.conflictReason} ${alignment.modelAllowanceReason}`;
};

const htfAlignmentNextActionFor = ({ currentRead }: IctResearchAdvisorDecisionExplanationInput) => {
  const alignment = currentRead.htfAlignment;
  if (!alignment) return "Rerun Activate Market so the compact multi-timeframe context reaches the current read.";
  if (alignment.alignmentStatus === "aligned") return "Keep HTF filter intact; continue normal deterministic validation.";
  if (alignment.modelAllowance === "soft_warning") return "Treat as watchlist/paper-only research evidence; do not promote until replay confirms the model.";
  if (alignment.alignmentStatus === "missing") return "Reload missing HTF context before evaluating this setup.";
  return "Wait for higher-timeframe agreement or a model-specific reversal/CMD confirmation that permits paper-only testing.";
};

const monteCarloReasonFor = ({ currentRead, latestResearchState }: IctResearchAdvisorDecisionExplanationInput) => {
  const latest = latestResearchState?.latestMonteCarlo;
  if (latest) {
    return `Monte Carlo saved with ${latest.usableOutcomes} usable outcomes and ${token(latest.robustnessRating)} robustness.`;
  }
  if (currentRead.latestMonteCarloStatus === "saved") {
    return `Monte Carlo saved with ${token(currentRead.latestMonteCarloRobustness)} robustness.`;
  }
  if (/insufficient/i.test(currentRead.latestMonteCarloReason ?? "")) {
    return `Monte Carlo insufficient - ${currentRead.latestMonteCarloReason}`;
  }
  return `Monte Carlo not saved - ${currentRead.latestMonteCarloReason || "no replay/paper outcome sample yet."}`;
};

const readinessReasonFor = ({ currentRead }: IctResearchAdvisorDecisionExplanationInput) => {
  const reason = firstList(currentRead.readinessSummary.reasons) ?? "paper/demo remains gated until replay, evidence, maturity, and risk checks pass.";
  if (currentRead.readinessSummary.paperReadiness === "not_eligible") {
    return `Paper readiness not eligible because ${reason} Research readiness is ${token(currentRead.readinessSummary.researchReadiness)}. Execution readiness is disabled by design.`;
  }
  return `Research readiness is ${token(currentRead.readinessSummary.researchReadiness)}, paper readiness is ${token(currentRead.readinessSummary.paperReadiness)}, and execution readiness is disabled. ${reason}`;
};

const walkForwardReasonFor = ({ currentRead, latestResearchState }: IctResearchAdvisorDecisionExplanationInput) => {
  const replay = latestResearchState?.latestReplay;
  if (!replay && !currentRead.latestReplayStatus) {
    return "Walk-forward insufficient because no completed replay/OOS sample is saved for this current read.";
  }
  const totalSignals = replay?.totalSignals ?? 0;
  if (totalSignals < 20) {
    return `Walk-forward insufficient because only ${totalSignals} replay signals are saved; more independent windows are required.`;
  }
  return `Walk-forward context available from latest replay with ${totalSignals} signals and approved target-first rate ${pct(replay?.approvedTargetFirstRate)}.`;
};

const evidenceReasonFor = ({ currentRead, latestResearchState }: IctResearchAdvisorDecisionExplanationInput) => {
  const replay = latestResearchState?.latestReplay;
  const monteCarlo = latestResearchState?.latestMonteCarlo;
  if (!replay && !monteCarlo) {
    return "Evidence quality weak because replay/paper outcome samples and Monte Carlo robustness are missing.";
  }
  if (!monteCarlo) {
    return "Evidence quality weak because Monte Carlo robustness is not saved yet.";
  }
  if ((monteCarlo.usableOutcomes ?? 0) < 30) {
    return `Evidence quality weak because Monte Carlo has only ${monteCarlo.usableOutcomes} usable outcomes.`;
  }
  if (currentRead.readinessSummary.paperReadiness !== "eligible") {
    return `Evidence quality still gated because paper readiness is ${token(currentRead.readinessSummary.paperReadiness)}.`;
  }
  return `Evidence quality has saved replay/Monte Carlo context, but GoTrader still keeps execution disabled.`;
};

export const buildResearchAdvisorDecisionExplanation = (
  input: IctResearchAdvisorDecisionExplanationInput
): IctResearchAdvisorDecisionExplanation => {
  const { currentRead, researchSignal, latestResearchState, cmdPaperTracking } = input;
  const laneStatus =
    currentRead.modelQualityLane === "approved"
      ? "ready"
      : currentRead.modelQualityLane === "paper_watchlist" || currentRead.modelQualityLane === "watchlist"
        ? "warning"
        : currentRead.modelQualityLane === "rejected"
          ? "rejected"
          : "blocked";
  const paperStatus = currentRead.paperSimAllowed || researchSignal.paperSimAllowed ? "eligible" : "not_eligible";
  const cmdStatus = cmdPaperTracking
    ? "tracking"
    : isCmd(currentRead.modelName ?? researchSignal.modelName) && currentRead.modelQualityLane === "paper_watchlist"
      ? "eligible"
      : "not_eligible";
  const monteCarloStatus = latestResearchState?.latestMonteCarlo || currentRead.latestMonteCarloStatus === "saved"
    ? "saved"
    : /insufficient/i.test(currentRead.latestMonteCarloReason ?? "")
      ? "insufficient"
      : "missing";
  const walkForwardStatus = latestResearchState?.latestReplay || currentRead.latestReplayStatus ? "warning" : "insufficient";
  const evidenceStatus = latestResearchState?.latestMonteCarlo && latestResearchState?.latestReplay ? "warning" : "weak";

  const sourceFacts = unique([
    `Source mode ${token(currentRead.packetSource)}`,
    `Requested ${currentRead.requestedSymbol}`,
    `Broker ${currentRead.brokerSymbol}`,
    `Primary ${currentRead.primaryTimeframe}`,
    currentRead.displayTimeframe ? `Chart display ${currentRead.displayTimeframe}` : undefined,
    `Analysis ${currentRead.analysisTimeframesUsed?.join(" / ") || "none"}`,
    `Depth ${token(currentRead.analysisDepthStatus)}`,
    `Weekly bias ${token(currentRead.weeklyBiasDirection)} / ${token(currentRead.weeklyBiasStatus)}`,
    `Hydration ${token(currentRead.debug.hydrationSource)}`
  ]);

  const sections = [
    section(
      "source_context",
      "Source context",
      currentRead.packetSource === "live_mt5" && currentRead.analysisDepthStatus === "sufficient" ? "ready" : "warning",
      `Current read uses ${token(currentRead.packetSource)} with ${currentRead.candleCount?.toLocaleString() ?? 0} compact candles; analysis depth is ${token(currentRead.analysisDepthStatus)} and weekly bias is ${token(currentRead.weeklyBiasStatus)}.`,
      currentRead.packetSource === "live_mt5" ? "Keep MT5 active and rerun Activate Market when the market window changes." : "Activate MT5 Research Mode before evaluating the advisor.",
      sourceFacts
    ),
    section(
      "htf_alignment",
      "HTF alignment",
      htfAlignmentStatusFor(input),
      htfAlignmentReasonFor(input),
      htfAlignmentNextActionFor(input),
      [
        currentRead.htfAlignment ? `Setup direction ${token(currentRead.htfAlignment.setupDirection)}` : undefined,
        currentRead.htfAlignment ? `Expected ${token(currentRead.htfAlignment.expectedDirection)}` : undefined,
        currentRead.htfAlignment ? `Status ${token(currentRead.htfAlignment.alignmentStatus)}` : undefined,
        currentRead.htfAlignment ? `Model allowance ${token(currentRead.htfAlignment.modelAllowance)}` : undefined,
        ...(currentRead.htfAlignment
          ? htfFrames.map((frame) => `${frame} ${token(currentRead.htfAlignment?.[frame])}`)
          : []),
        currentRead.htfAlignment?.modelAllowanceReason
      ]
    ),
    section(
      "lane_decision",
      "Lane decision",
      laneStatus,
      laneReasonFor(input),
      currentRead.nextAction || researchSignal.nextAction,
      [
        `Model detected ${compact(currentRead.modelDetected)}`,
        `Model ${token(currentRead.modelName)}`,
        `Model state ${token(currentRead.modelState)}`,
        `Model direction ${token(currentRead.modelDirection)}`,
        `Opportunity ${token(currentRead.opportunityType)} / ${token(currentRead.opportunityStage)} / ${token(currentRead.opportunityQuality)}`,
        `Approved status ${token(currentRead.approvedStatus)}`,
        `Lane ${token(currentRead.modelQualityLane)}`,
        firstList(currentRead.modelMissingEvidence) ? `Missing ${firstList(currentRead.modelMissingEvidence)}` : undefined
      ]
    ),
    section(
      "paper_sim",
      "Paper Sim eligibility",
      paperStatus,
      paperSimReasonFor(input),
      paperStatus === "eligible" ? "Use the paper-only simulator manually; execution remains disabled." : "First produce an approved research signal or explicit paper-watchlist candidate with target, invalidation, and RR.",
      [
        `Signal status ${token(researchSignal.status)}`,
        `Paper allowed ${compact(currentRead.paperSimAllowed || researchSignal.paperSimAllowed)}`,
        `Paper only ${compact(currentRead.paperOnly || researchSignal.paperOnly)}`,
        `Side ${token(currentRead.side)}`,
        `Target ${typeof currentRead.target === "number" ? "present" : "missing"}`,
        `Invalidation ${typeof currentRead.invalidation === "number" ? "present" : "missing"}`,
        `RR ${typeof currentRead.rrEstimate === "number" ? `${currentRead.rrEstimate.toFixed(2)}R` : "missing"}`,
        `Confidence ${pct(currentRead.confidence)}`
      ]
    ),
    section(
      "cmd_paper",
      "CMD Paper eligibility",
      cmdStatus,
      cmdPaperReasonFor(input),
      currentRead.cmdIndependentDateGateRequired && currentRead.cmdIndependentDateGateStatus !== "passed"
        ? currentRead.cmdIndependentDateGateNextAction ?? "Run independent-date CMD validation over 90-day history."
        : cmdStatus === "eligible"
          ? "Create CMD paper tracking manually if the operator wants to monitor this candidate."
          : "Wait for a strict CMD paper-watchlist candidate; do not track AME/watchlist/rejected/no-trade states as CMD Paper.",
      [
        `CMD detected ${compact(isCmd(currentRead.modelName ?? researchSignal.modelName))}`,
        `Model ${token(currentRead.modelName ?? researchSignal.modelName)}`,
        `Lane ${token(currentRead.modelQualityLane)}`,
        `Profile ${token(currentRead.approvedStatus)}`,
        currentRead.cmdIndependentDateGateStatus ? `Independent-date gate ${token(currentRead.cmdIndependentDateGateStatus)}` : undefined,
        currentRead.cmdIndependentDateGateReason,
        currentRead.paperWatchlistReason
      ]
    ),
    section(
      "monte_carlo",
      "Monte Carlo status",
      monteCarloStatus,
      monteCarloReasonFor(input),
      monteCarloStatus === "saved" ? "Use Monte Carlo as evidence only; it cannot override readiness." : "Run and save replay/paper outcomes, then run Monte Carlo.",
      [
        `Latest state ${latestResearchState?.latestMonteCarlo ? "present" : "missing"}`,
        `Usable outcomes ${compact(latestResearchState?.latestMonteCarlo?.usableOutcomes ?? currentRead.latestMonteCarloUsableOutcomes)}`,
        `Robustness ${token(latestResearchState?.latestMonteCarlo?.robustnessRating ?? currentRead.latestMonteCarloRobustness)}`,
        `Risk of ruin ${pctRaw(latestResearchState?.latestMonteCarlo?.riskOfRuinPct ?? currentRead.latestMonteCarloRiskOfRuinPct)}`,
        `Recommended max risk ${pctRaw(latestResearchState?.latestMonteCarlo?.recommendedMaxRiskPerTradePct ?? currentRead.latestMonteCarloRecommendedRiskPct)}`
      ]
    ),
    section(
      "readiness_split",
      "Readiness split",
      currentRead.readinessSummary.paperReadiness === "eligible" ? "eligible" : "not_eligible",
      readinessReasonFor(input),
      "Treat Research Ready, Paper-Demo Candidate, and execution readiness as separate gates; the advisor cannot promote any gate.",
      [
        `Research ${token(currentRead.readinessSummary.researchReadiness)}`,
        `Paper ${token(currentRead.readinessSummary.paperReadiness)}`,
        `Execution ${token(currentRead.readinessSummary.executionReadiness)}`,
        firstList(currentRead.readinessSummary.reasons)
      ]
    ),
    section(
      "walk_forward",
      "Walk-forward status",
      walkForwardStatus,
      walkForwardReasonFor(input),
      currentRead.cmdIndependentDateGateRequired
        ? currentRead.cmdIndependentDateGateNextAction ?? "Run independent-date CMD validation over 90-day history."
        : "Run replay/walk-forward validation across independent windows before treating any lane as paper-demo mature.",
      [
        `Replay ${token(currentRead.latestReplayStatus ?? (latestResearchState?.latestReplay ? "saved" : "none saved"))}`,
        `Signals ${compact(latestResearchState?.latestReplay?.totalSignals)}`,
        `Target-first ${pct(latestResearchState?.latestReplay?.targetFirstRate)}`,
        `Approved target-first ${pct(latestResearchState?.latestReplay?.approvedTargetFirstRate)}`
      ]
    ),
    section(
      "evidence_quality",
      "Evidence quality",
      evidenceStatus,
      evidenceReasonFor(input),
      "Build evidence with replay, walk-forward/OOS windows, paper outcomes, and Monte Carlo before changing any model lane.",
      [
        `Replay sample ${compact(latestResearchState?.latestReplay?.totalSignals)}`,
        `Monte Carlo outcomes ${compact(latestResearchState?.latestMonteCarlo?.usableOutcomes)}`,
        `Monte Carlo ${token(latestResearchState?.latestMonteCarlo?.robustnessRating ?? currentRead.latestMonteCarloRobustness)}`,
        `Paper readiness ${token(currentRead.readinessSummary.paperReadiness)}`
      ]
    ),
    section(
      "next_safe_action",
      "Next safe action",
      "disabled",
      `Next safe action: ${researchSignal.nextAction || currentRead.nextAction || "collect more deterministic evidence."} Execution remains disabled and broker authority remains none.`,
      "Use deterministic replay/paper validation or wait for a cleaner setup; do not place orders from this advisor.",
      [
        "executionAuthority none",
        "brokerAuthority none",
        "readinessOverrideAuthority none",
        `Hypothesis ${currentRead.selfImprovementHypothesisQueued ? "queued" : "not queued"}`,
        currentRead.selfImprovementHypothesisQueued ? currentRead.selfImprovementNextValidation : currentRead.selfImprovementHypothesisReason
      ]
    )
  ];

  return {
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    sourceMode: currentRead.packetSource,
    packetSource: currentRead.packetSource,
    requestedSymbol: currentRead.requestedSymbol,
    brokerSymbol: currentRead.brokerSymbol,
    primaryTimeframe: currentRead.primaryTimeframe,
    displayTimeframe: currentRead.displayTimeframe,
    displayTimeframeRole: currentRead.displayTimeframeRole,
    analysisTimeframesUsed: currentRead.analysisTimeframesUsed ?? [],
    analysisDepthStatus: currentRead.analysisDepthStatus ?? "unknown",
    weeklyBiasStatus: currentRead.weeklyBiasStatus ?? "unknown",
    weeklyBiasDirection: currentRead.weeklyBiasDirection ?? "unknown",
    candleHydrationStatus: currentRead.debug.hydrationSource ?? "unknown",
    sourceFingerprint: currentRead.debug.sourceFingerprint,
    sections,
    authority,
    safety
  };
};

export const assertResearchAdvisorDecisionExplanationIsCompact = (
  explanation: IctResearchAdvisorDecisionExplanation
) => {
  const serialized = JSON.stringify(explanation);
  return {
    ok:
      explanation.researchOnly === true &&
      explanation.authority.executionAuthority === "none" &&
      explanation.authority.brokerAuthority === "none" &&
      explanation.authority.readinessOverrideAuthority === "none" &&
      explanation.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
