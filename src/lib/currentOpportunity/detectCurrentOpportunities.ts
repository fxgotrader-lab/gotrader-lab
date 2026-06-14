import type {
  CurrentOpportunity,
  CurrentOpportunityContext,
  CurrentOpportunityScan,
  CurrentOpportunityStatus,
  CurrentOpportunityStrategyId,
  CurrentOpportunitySummary
} from "./currentOpportunityTypes";

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

const createId = (prefix: string, seed: string) =>
  `${prefix}_${Math.abs([...seed].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)).toString(36)}`;

const token = (value?: string) => (value?.trim() ? value : "unknown").replace(/_/g, " ");
const finite = (value?: number) => typeof value === "number" && Number.isFinite(value);
const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())))).slice(0, 8);

const statusRank: Record<CurrentOpportunityStatus, number> = {
  valid_candidate: 6,
  forming: 5,
  near_miss: 4,
  rejected: 3,
  needs_more_data: 2,
  no_trade: 1
};

const statusForPrimaryContext = (context: CurrentOpportunityContext): CurrentOpportunityStatus => {
  if (context.isMockOrSample) return "rejected";
  if (context.sourceDepth.depthPolicyStatus === "insufficient") return "needs_more_data";
  if (context.currentOpportunityDetected && finite(context.target) && finite(context.invalidation) && finite(context.rrEstimate)) {
    if (context.modelLane === "approved" && context.sourceDepth.validationContextAvailable) return "valid_candidate";
    if (context.modelLane === "paper_watchlist") return "near_miss";
    return "forming";
  }
  if (context.currentOpportunityDetected) return "forming";
  if (context.opportunityMissingEvidence.length || context.opportunityBlockers.length) return "near_miss";
  return "no_trade";
};

const validationFor = (status: CurrentOpportunityStatus) =>
  status === "valid_candidate"
    ? ["replay_required", "walk_forward_required", "evidence_required"] as const
    : status === "forming" || status === "near_miss"
      ? ["replay_required"] as const
      : [] as const;

const opportunity = (
  context: CurrentOpportunityContext,
  patch: Omit<Partial<CurrentOpportunity>, "blockers" | "missingConditions"> & {
    strategyId: CurrentOpportunityStrategyId;
    model: string;
    status: CurrentOpportunityStatus;
    setupName: string;
    thesis: string;
    blockers?: Array<string | undefined>;
    missingConditions?: Array<string | undefined>;
  }
): CurrentOpportunity => ({
  id: createId("current_opp", `${patch.strategyId}:${patch.setupName}:${context.generatedAt}:${patch.status}`),
  strategyId: patch.strategyId,
  model: patch.model,
  symbol: context.requestedSymbol,
  brokerSymbol: context.brokerSymbol,
  side: patch.side ?? context.side ?? "flat",
  timeframe: patch.timeframe ?? context.primaryTimeframe,
  contextTimeframes: context.contextTimeframes,
  status: patch.status,
  setupName: patch.setupName,
  thesis: patch.thesis,
  entry: patch.entry ?? context.entry,
  invalidation: patch.invalidation ?? context.invalidation,
  target: patch.target ?? context.target,
  rrEstimate: patch.rrEstimate ?? context.rrEstimate,
  confidence: patch.confidence ?? context.confidence ?? 0,
  requiredValidation: patch.requiredValidation ?? [...validationFor(patch.status)],
  blockers: unique(patch.blockers ?? []),
  missingConditions: unique(patch.missingConditions ?? []),
  nextAction: patch.nextAction ?? context.opportunityNextAction ?? "Keep monitoring; no approved research candidate is available.",
  sourceDepth: context.sourceDepth,
  researchOnly: true,
  executionIntentCreated: false,
  authority
});

const baseBlockersFor = (context: CurrentOpportunityContext) =>
  unique([
    context.isMockOrSample ? "Mock/sample source cannot produce a valid live opportunity." : undefined,
    !context.isResearchActive ? "Active source is not MT5 read-only research-active." : undefined,
    !context.sourceFingerprint ? "Source fingerprint is missing." : undefined,
    ...context.sourceDepth.depthWarnings
  ]);

const primaryOpportunity = (context: CurrentOpportunityContext) => {
  const status = statusForPrimaryContext(context);
  const isCmd = /consolidation|cmd/i.test(`${context.modelName ?? ""} ${context.sessionNarrativeProfile ?? ""} ${context.opportunityType ?? ""}`);
  const cmdBlocked = isCmd && context.cmdIndependentDateGateStatus && context.cmdIndependentDateGateStatus !== "passed";
  return opportunity(context, {
    strategyId: isCmd ? "ict_cmd_short_paper_watchlist_v1" : "market_map_only_diagnostic_v1",
    model: context.modelName ?? context.opportunityType ?? "current_market_read",
    status: cmdBlocked ? "near_miss" : status,
    setupName: context.setupName ?? context.opportunityType ?? "current_market_context",
    thesis: context.thesis ?? "Current market read is waiting for a structured ICT setup.",
    blockers: [
      ...baseBlockersFor(context),
      cmdBlocked ? context.cmdIndependentDateGateReason ?? "CMD needs independent-date validation." : undefined,
      ...context.opportunityBlockers
    ],
    missingConditions: [
      ...context.opportunityMissingEvidence,
      !finite(context.target) ? "target" : undefined,
      !finite(context.invalidation) ? "invalidation" : undefined,
      !finite(context.rrEstimate) ? "rr_estimate" : undefined
    ],
    nextAction: cmdBlocked
      ? "Run independent-date CMD validation over 90-day history."
      : context.opportunityNextAction ?? "Run Activate Market with explicit MT5 90-day context."
  });
};

const strategyDiagnostics = (context: CurrentOpportunityContext): CurrentOpportunity[] => {
  const sharedBlockers = baseBlockersFor(context);
  const outsideDeepContext = context.sourceDepth.depthPolicyStatus === "tactical_only" || context.sourceDepth.depthPolicyStatus === "insufficient";
  const hasSweep = /sweep|liquidity|raid/i.test(`${context.liquiditySwept ?? ""} ${context.opportunityType ?? ""} ${context.topReasons.join(" ")}`);
  const hasFvg = /fvg|fair value/i.test(`${context.fvgStatus ?? ""} ${context.drawOnLiquidity ?? ""} ${context.opportunityMissingEvidence.join(" ")}`);
  const hasDisplacement = /displacement|expansion/i.test(`${context.displacementStatus ?? ""} ${context.opportunityType ?? ""} ${context.topReasons.join(" ")}`);
  const htfBlocked = /conflicted|missing|mixed/i.test(context.htfAlignmentStatus ?? "");

  return [
    opportunity(context, {
      strategyId: "silver_bullet_v1",
      model: "Silver Bullet v1",
      status: outsideDeepContext ? "needs_more_data" : hasSweep && hasFvg ? "forming" : "near_miss",
      setupName: "sweep_fvg_return",
      thesis: "Silver Bullet needs a session sweep, displacement/FVG, and return-to-FVG entry inside a valid kill zone.",
      blockers: sharedBlockers,
      missingConditions: [
        hasSweep ? undefined : "liquidity_sweep",
        hasFvg ? undefined : "fvg_return",
        context.missingTimeframes.length ? `missing_timeframes:${context.missingTimeframes.join("/")}` : undefined
      ],
      nextAction: hasSweep && !hasFvg ? "Watch for FVG creation and return; do not infer an entry from the sweep alone." : "Run Silver Bullet replay validation when sweep/FVG conditions align."
    }),
    opportunity(context, {
      strategyId: "silver_bullet_v2_refined_research",
      model: "Silver Bullet v2 refined",
      status: hasSweep && hasFvg && !htfBlocked ? "forming" : "near_miss",
      setupName: "refined_sweep_displacement_fvg",
      thesis: "Refined Silver Bullet requires cleaner sweep quality, displacement, FVG respect, and model-aware context.",
      blockers: [...sharedBlockers, htfBlocked ? `HTF alignment ${context.htfAlignmentStatus}: ${context.htfConflictReason ?? "not aligned"}` : undefined],
      missingConditions: [
        hasSweep ? undefined : "session_liquidity_sweep",
        hasDisplacement ? undefined : "displacement",
        hasFvg ? undefined : "fvg_respected"
      ],
      nextAction: "Keep as research-only until replay/OOS improves across independent dates."
    }),
    opportunity(context, {
      strategyId: "cisd_v1",
      model: "CISD v1",
      status: hasDisplacement ? "forming" : "near_miss",
      setupName: "change_in_state_of_delivery",
      thesis: "CISD needs a clear prior delivery leg, a strong opposite close through a prior body, and a clean retest of the body zone.",
      blockers: sharedBlockers,
      missingConditions: [
        /trend|delivery|direction/i.test(context.topReasons.join(" ")) ? undefined : "prior_delivery_direction",
        hasDisplacement ? undefined : "strong_cisd_candle",
        finite(context.rrEstimate) ? undefined : "rr_minimum"
      ],
      nextAction: "If CISD forms, queue replay validation; recognition alone is not evidence."
    }),
    opportunity(context, {
      strategyId: "turtle_soup_v1",
      model: "Turtle Soup v1",
      status: hasSweep && !hasDisplacement ? "near_miss" : "no_trade",
      setupName: "range_sweep_reversal",
      thesis: "Turtle Soup needs a setup-range sweep, rejection, MSS/shift, retest, and RR.",
      blockers: sharedBlockers,
      missingConditions: [
        hasSweep ? undefined : "setup_range_sweep",
        hasDisplacement ? undefined : "rejection_or_mss",
        finite(context.rrEstimate) ? undefined : "rr_minimum"
      ],
      nextAction: "Do not relax Turtle Soup until sweep/rejection blockers repeat across replay diagnostics."
    }),
    opportunity(context, {
      strategyId: "ifvg_v1",
      model: "IFVG v1",
      status: hasFvg ? "forming" : "no_trade",
      setupName: "inversion_fvg_retest",
      thesis: "IFVG is research-only until an inverted FVG and retest are visible in compact context.",
      blockers: sharedBlockers,
      missingConditions: [
        hasFvg ? undefined : "fair_value_gap",
        /inversion|inverse|ifvg/i.test(context.topReasons.join(" ")) ? undefined : "full_inversion",
        "retest_confirmation"
      ],
      nextAction: "Track as unavailable/research-only unless the IFVG detector returns a compact candidate."
    }),
    opportunity(context, {
      strategyId: "market_map_only_diagnostic_v1",
      model: "Market map diagnostic",
      status: context.currentOpportunityDetected ? "forming" : "no_trade",
      setupName: "market_map_only",
      thesis: "Market-map context can explain bias, liquidity, and session state but cannot become a standalone trade idea.",
      blockers: sharedBlockers,
      missingConditions: context.currentOpportunityDetected ? [] : ["full_model_confirmation"],
      nextAction: "Use the market map to wait for a detector-backed model, not to create an entry."
    })
  ];
};

const summarize = (context: CurrentOpportunityContext, opportunities: CurrentOpportunity[]): CurrentOpportunitySummary => {
  const sorted = opportunities.slice().sort((left, right) => statusRank[right.status] - statusRank[left.status] || right.confidence - left.confidence);
  const count = (status: CurrentOpportunityStatus) => opportunities.filter((item) => item.status === status).length;
  const topOpportunity = sorted.find((item) => item.status === "valid_candidate" || item.status === "forming");
  const topNearMiss = sorted.find((item) => item.status === "near_miss");
  const topRejected = sorted.find((item) => item.status === "rejected");
  const topBlocker =
    topOpportunity?.blockers[0] ??
    topNearMiss?.missingConditions[0] ??
    topNearMiss?.blockers[0] ??
    context.sourceDepth.depthWarnings[0] ??
    context.topReasons[0];
  return {
    generatedAt: context.generatedAt,
    requestedSymbol: context.requestedSymbol,
    brokerSymbol: context.brokerSymbol,
    primaryTimeframe: context.primaryTimeframe,
    sourceProvider: context.sourceProvider,
    sourceFingerprint: context.sourceFingerprint,
    depthStatus: context.sourceDepth.depthPolicyStatus,
    topDownBiasStatus: context.topDownBiasStatus,
    timeframeRoleSummary: context.timeframeRoleSummary,
    validCandidateCount: count("valid_candidate"),
    formingCount: count("forming"),
    nearMissCount: count("near_miss"),
    rejectedCount: count("rejected"),
    noTradeCount: count("no_trade"),
    needsMoreDataCount: count("needs_more_data"),
    topOpportunity,
    topNearMiss,
    topRejected,
    topBlocker,
    nextAction: topOpportunity?.nextAction ?? topNearMiss?.nextAction ?? "Run Activate Market with explicit MT5 90-day context.",
    rangeHistoryAvailable: context.sourceDepth.rangeHistoryAvailable,
    validationLookbackDays: context.sourceDepth.validationLookbackDays,
    authority,
    safety
  };
};

export const detectCurrentOpportunities = (context: CurrentOpportunityContext): CurrentOpportunityScan => {
  const opportunities = [primaryOpportunity(context), ...strategyDiagnostics(context)].sort(
    (left, right) => statusRank[right.status] - statusRank[left.status] || right.confidence - left.confidence
  );
  const summary = summarize(context, opportunities);
  return {
    scanId: createId("current_scan", `${context.generatedAt}:${context.sourceFingerprint ?? "no_fp"}:${opportunities.length}`),
    generatedAt: context.generatedAt,
    context: {
      ...context,
      topReasonCount: context.topReasons.length,
      opportunityBlockerCount: context.opportunityBlockers.length,
      opportunityMissingEvidenceCount: context.opportunityMissingEvidence.length
    },
    opportunities,
    summary,
    researchOnly: true,
    authority,
    safety
  };
};

export const assertCurrentOpportunityScanIsCompact = (scan: CurrentOpportunityScan) => {
  const serialized = JSON.stringify(scan);
  return {
    ok:
      scan.researchOnly === true &&
      scan.authority.executionAuthority === "none" &&
      scan.authority.brokerAuthority === "none" &&
      scan.authority.readinessOverrideAuthority === "none" &&
      scan.safety.rawCandlesExcluded === true &&
      scan.opportunities.every((item) => item.researchOnly === true && item.executionIntentCreated === false) &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};

export const summarizeCurrentOpportunityScan = (scan?: CurrentOpportunityScan) => {
  if (!scan) return "Current opportunity scanner has not run.";
  const top = scan.summary.topOpportunity ?? scan.summary.topNearMiss ?? scan.summary.topRejected;
  return top
    ? `${token(top.model)} / ${token(top.status)} / ${token(top.side)}. Next: ${top.nextAction}`
    : `No current opportunity. Next: ${scan.summary.nextAction}`;
};
