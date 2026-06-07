import type { ResearchRuntimeSnapshot } from "../runtime";
import { buildIctAdvisorPacketFromRuntime } from "./ictAdvisorEngine";
import type { IctAdvisorPacket, IctAdvisorSignal } from "./ictAdvisorTypes";
import type { IctLatestResearchState } from "./ictLatestResearchStateTypes";
import type {
  IctCurrentRead,
  IctCurrentReadDataStatus,
  IctModelQualityLane,
  IctCurrentReadPacketSource
} from "./ictCurrentReadTypes";

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

const statusWeight = (status?: string) =>
  status === "approved_research_candidate"
    ? 4
    : status === "paper_watchlist_candidate"
      ? 3
      : status === "watchlist_candidate"
        ? 2
        : status === "rejected_candidate"
          ? 1
          : status === "no_trade"
            ? 0.5
            : 0;

const bestSignalFrom = (signals: IctAdvisorSignal[]) =>
  signals
    .slice()
    .sort((left, right) => {
      const leftDirectional = left.side === "long" || left.side === "short" ? 1 : 0;
      const rightDirectional = right.side === "long" || right.side === "short" ? 1 : 0;
      return (
        statusWeight(right.approvedProfileDecision?.status) -
          statusWeight(left.approvedProfileDecision?.status) ||
        rightDirectional - leftDirectional ||
        right.confidence - left.confidence ||
        (right.rrEstimate ?? 0) - (left.rrEstimate ?? 0)
      );
    })[0];

const packetSourceFor = (packet?: IctAdvisorPacket): IctCurrentReadPacketSource => {
  if (!packet) return "unavailable";
  if (packet.activeSource.provider === "mt5_read_only") return "live_mt5";
  if (packet.activeSource.provider === "replay") return "manual_replay";
  if (packet.activeSource.provider === "mock") return "default";
  return packet.activeSource.candleCount > 0 ? "default" : "unavailable";
};

const dataStatusFor = (packet?: IctAdvisorPacket): IctCurrentReadDataStatus => {
  if (!packet) return "unavailable";
  if (!packet.activeSource.candleCount) return "missing";
  if (!packet.activeSource.sourceFingerprint) return "stale";
  return "ready";
};

const liquidityLabel = (value?: { type: string; price: number }) =>
  value ? `${value.type} @ ${value.price}` : undefined;

const entryZoneLabel = (entryZone?: IctAdvisorSignal["entryZone"]) =>
  entryZone ? `${entryZone.low}-${entryZone.high}` : undefined;

const pct = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : undefined);

const latestResearchSummaryFor = (latestState?: IctLatestResearchState) => {
  const latestReplay = latestState?.latestReplay;
  const latestMonteCarlo = latestState?.latestMonteCarlo;
  const latestScorecard = latestState?.latestScorecard;
  const bestScorecardSymbol =
    latestScorecard?.bestApprovedTargetFirstSymbol ??
    latestScorecard?.bestApprovedRrSymbol ??
    latestScorecard?.researchPreferredSymbols[0];
  return {
    latestReplayStatus: latestReplay
      ? `target-first ${pct(latestReplay.approvedTargetFirstRate ?? latestReplay.targetFirstRate) ?? "n/a"}`
      : undefined,
    latestMonteCarloRobustness: latestMonteCarlo?.robustnessRating,
    latestMonteCarloRiskOfRuinPct: latestMonteCarlo?.riskOfRuinPct,
    latestMonteCarloRecommendedRiskPct: latestMonteCarlo?.recommendedMaxRiskPerTradePct,
    latestScorecardBestSymbol: bestScorecardSymbol,
    latestScorecardResearchPreferredSymbols: latestScorecard?.researchPreferredSymbols,
    latestResearchStateUpdatedAt: latestState?.updatedAt,
    latestResearchStateNote: latestState
      ? "Latest manual research result; not live signal generation and not a readiness override."
      : undefined
  } satisfies Partial<IctCurrentRead>;
};

const fvgStatusFor = (signal?: IctAdvisorSignal) => {
  if (!signal) return undefined;
  if (!signal.fairValueGap) return "missing";
  return signal.fairValueGap.mitigated ? "mitigated" : `${signal.fairValueGap.direction}_present`;
};

const displacementStatusFor = (signal?: IctAdvisorSignal) => {
  if (!signal) return undefined;
  if (!signal.displacement) return "missing";
  return signal.displacement.createdFvg
    ? `${signal.displacement.direction}_with_fvg`
    : `${signal.displacement.direction}_without_fvg`;
};

const htfStatusFor = (packet: IctAdvisorPacket) => {
  const expected = new Set(["15m", "1h", ...packet.htfTimeframes]);
  return Object.fromEntries(
    [...expected].map((timeframe) => [
      timeframe,
      packet.htfTimeframes.includes(timeframe) ? "ready" : "missing"
    ])
  ) as IctCurrentRead["htfStatus"];
};

const uniqueReasons = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())))).slice(0, 6);

const modelQualityLaneFor = (status?: string): IctModelQualityLane => {
  if (status === "approved_research_candidate") return "approved";
  if (status === "paper_watchlist_candidate") return "paper_watchlist";
  if (status === "watchlist_candidate") return "watchlist";
  if (status === "rejected_candidate") return "rejected";
  return "no_trade";
};

const primaryModelNameFor = (packet: IctAdvisorPacket) =>
  packet.sessionNarrative?.primaryModelDetection?.modelName ?? packet.compactSummary.primaryModelDetection?.modelName;

const modelLabelFor = (packet: IctAdvisorPacket) =>
  (primaryModelNameFor(packet) ?? packet.compactSummary.sessionNarrativeProfile ?? packet.sessionNarrative?.profile ?? "current model").replace(/_/g, " ");

const paperWatchlistReasonFor = (packet: IctAdvisorPacket, lane: IctModelQualityLane, reasons: string[]) => {
  const modelName = primaryModelNameFor(packet);
  if (lane === "paper_watchlist" && modelName === "consolidation_manipulation_distribution") {
    return "CMD paper-watchlist - paper-test only.";
  }
  if (lane === "paper_watchlist") return `${modelLabelFor(packet)} paper-watchlist - paper-test only.`;
  if (lane === "watchlist" && modelName === "accumulation_manipulation_expansion") {
    return "AME watchlist only - not paper-ready.";
  }
  if (lane === "watchlist") return reasons[0] ?? "Watchlist only - not paper eligible.";
  if (lane === "rejected") return reasons[0] ?? "Rejected by the approved-profile gate.";
  if (lane === "no_trade") return reasons[0] ?? "No active model-quality lane.";
  return "Approved research lane; replay, evidence, maturity, and readiness gates still apply.";
};

const paperWatchlistEvidenceSummaryFor = (packet: IctAdvisorPacket, lane: IctModelQualityLane) => {
  const model = packet.sessionNarrative?.primaryModelDetection ?? packet.compactSummary.primaryModelDetection;
  const modelPart = model?.modelDetected
    ? `${(model.modelName ?? "model").replace(/_/g, " ")} / ${(model.modelState ?? "pending").replace(/_/g, " ")} / ${(model.modelDirection ?? "unknown").replace(/_/g, " ")}`
    : "No model detected.";
  const rrPart = typeof packet.recommendedSignal.rrEstimate === "number"
    ? `RR ${packet.recommendedSignal.rrEstimate.toFixed(2)}R`
    : "RR missing";
  const confidencePart = typeof packet.recommendedSignal.confidence === "number"
    ? `confidence ${Math.round(packet.recommendedSignal.confidence * 100)}%`
    : "confidence n/a";
  return `${modelPart}. Lane ${lane.replace(/_/g, " ")}; ${rrPart}; ${confidencePart}; authority none.`;
};

const nextActionFor = (packet: IctAdvisorPacket, reasons: string[]) => {
  const status = packet.approvedProfileDecision.status;
  if (!packet.activeSource.candleCount) return "Check MT5 Read Only or activate a canonical research source.";
  if (!packet.htfTimeframes.length) return "Fetch 15m and 1h MT5 context before trusting the current read.";
  if (status === "approved_research_candidate") return "Run replay and walk-forward before any readiness review.";
  if (status === "paper_watchlist_candidate") return "Paper-watchlist only: run explicit paper simulation and collect replay evidence; no readiness promotion.";
  if (status === "watchlist_candidate") return "Keep on watchlist and test the blocking evidence with replay.";
  if (reasons.some((reason) => /rr|target/i.test(reason))) return "Wait for a cleaner target and RR profile.";
  if (reasons.some((reason) => /fvg|displacement/i.test(reason))) return "Wait for displacement/FVG evidence before retesting.";
  if (reasons.some((reason) => /smt|relative strength/i.test(reason))) return "Fetch or compare correlated index context for SMT confirmation.";
  if (reasons.some((reason) => /news|session/i.test(reason))) return "Wait until news/session risk clears.";
  return "Continue observation; current setup is not an approved research candidate.";
};

export const buildUnavailableIctCurrentRead = (
  reason = "Active ICT advisor packet is unavailable.",
  latestState?: IctLatestResearchState
): IctCurrentRead => ({
  researchOnly: true,
  packetSource: "unavailable",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: [],
  dataStatus: "unavailable",
  side: "flat",
  approvedStatus: "no_trade",
  modelQualityLane: "no_trade",
  paperWatchlistEligible: false,
  paperWatchlistReason: reason,
  paperWatchlistEvidenceSummary: "No compact ICT model-quality evidence is available.",
  executionAllowed: false,
  topReasons: [reason],
  nextAction: "Activate Market or check the canonical research source.",
  debug: {
    candleCount: 0,
    primaryTimeframeAvailable: false,
    htfTimeframesAvailable: [],
    phase1SignalCount: 0,
    phase2SignalCount: 0,
    approvedStatus: "no_trade",
    rejectionReasonsCount: 0,
    noTradeReasonsCount: 1,
    lastEvaluationAt: new Date().toISOString(),
    packetSource: "unavailable"
  },
  ...latestResearchSummaryFor(latestState),
  authority,
  safety
});

export const buildIctCurrentReadFromPacket = (packet?: IctAdvisorPacket, latestState?: IctLatestResearchState): IctCurrentRead => {
  if (!packet) return buildUnavailableIctCurrentRead(undefined, latestState);
  const phase1Signals = packet.signals.filter((signal) => signal.phase === "phase_1");
  const phase2Signals = packet.signals.filter((signal) => signal.phase === "phase_2");
  const bestPhase1 = bestSignalFrom(phase1Signals);
  const bestPhase2 = bestSignalFrom(phase2Signals);
  const recommended = packet.recommendedSignal;
  const reasons = uniqueReasons([
    packet.activeSource.candleCount <= 0 ? "Missing candle data from active canonical research source." : undefined,
    packet.htfTimeframes.length === 0 ? "Missing higher-timeframe context for the current advisor read." : undefined,
    ...packet.approvedProfileDecision.rejectionReasons,
    ...packet.approvedProfileDecision.watchlistReasons,
    ...recommended.noTradeReasons,
    ...(recommended.newsSessionRisk?.newsSessionRiskNotes ?? []),
    recommended.smt?.reason,
    ...(packet.sessionNarrative?.topReasons ?? []),
    ...(packet.sessionNarrative?.primaryModelDetection?.modelReasons ?? []),
    ...(packet.sessionNarrative?.primaryModelDetection?.missingEvidence?.map((reason) => `Model missing evidence: ${reason}.`) ?? []),
    packet.sessionNarrative?.fvgTarget?.detected ? packet.sessionNarrative.fvgTarget.note : undefined,
    packet.sessionNarrative?.dataDepth.status !== "sufficient" ? packet.sessionNarrative?.dataDepth.note : undefined
  ]);
  const packetSource = packetSourceFor(packet);
  const dataStatus = dataStatusFor(packet);
  const modelQualityLane = modelQualityLaneFor(packet.approvedProfileDecision.status);
  const paperWatchlistEligible = modelQualityLane === "paper_watchlist";
  const paperWatchlistReason = paperWatchlistReasonFor(packet, modelQualityLane, reasons);
  const paperWatchlistEvidenceSummary = paperWatchlistEvidenceSummaryFor(packet, modelQualityLane);
  const paperWatchlistModelName = primaryModelNameFor(packet);

  return {
    researchOnly: true,
    packetSource,
    requestedSymbol: packet.requestedSymbol,
    brokerSymbol: packet.brokerSymbol,
    primaryTimeframe: packet.primaryTimeframe,
    htfTimeframes: packet.htfTimeframes,
    dataStatus,
    candleCount: packet.activeSource.candleCount,
    htfStatus: htfStatusFor(packet),
    bestPhase1Setup: bestPhase1?.setup,
    bestPhase2Setup: bestPhase2?.setup,
    bestSetup: recommended.setup,
    side: recommended.side,
    approvedStatus: packet.approvedProfileDecision.status,
    modelQualityLane,
    paperWatchlistEligible,
    paperWatchlistModelName: paperWatchlistEligible ? paperWatchlistModelName : undefined,
    paperWatchlistReason,
    paperWatchlistEvidenceSummary,
    executionAllowed: false,
    approvalScore: packet.approvedProfileDecision.approvalScore,
    confidence: recommended.confidence,
    rrEstimate: recommended.rrEstimate,
    target: recommended.target,
    invalidation: recommended.invalidation,
    bias: recommended.bias.composite,
    smtStatus: recommended.smt
      ? recommended.smt.rejectsCandidate
        ? "rejects_candidate"
        : recommended.smt.confirmsCandidate
          ? "confirms_candidate"
          : recommended.smt.divergenceType
      : "not_available",
    riskStatus: recommended.newsSessionRisk?.riskGovernorAction ?? "not_available",
    dealingRangeLocation: recommended.dealingRange?.currentLocation,
    drawOnLiquidity: liquidityLabel(recommended.drawOnLiquidity),
    liquiditySwept: liquidityLabel(recommended.liquiditySwept),
    fvgStatus: fvgStatusFor(recommended),
    displacementStatus: displacementStatusFor(recommended),
    entryZone: entryZoneLabel(recommended.entryZone),
    ...latestResearchSummaryFor(latestState),
    sessionNarrativeProfile: packet.sessionNarrative?.profile ?? packet.compactSummary.sessionNarrativeProfile,
    sessionDirectionalRead: packet.sessionNarrative?.directionalRead ?? packet.compactSummary.sessionDirectionalRead,
    sessionNarrativeConfidence: packet.sessionNarrative?.confidence ?? packet.compactSummary.sessionNarrativeConfidence,
    modelDetected: Boolean(packet.sessionNarrative?.primaryModelDetection?.modelDetected ?? packet.compactSummary.primaryModelDetection?.modelDetected),
    modelName: packet.sessionNarrative?.primaryModelDetection?.modelName ?? packet.compactSummary.primaryModelDetection?.modelName,
    modelState: packet.sessionNarrative?.primaryModelDetection?.modelState ?? packet.compactSummary.primaryModelDetection?.modelState,
    modelDirection: packet.sessionNarrative?.primaryModelDetection?.modelDirection ?? packet.compactSummary.primaryModelDetection?.modelDirection,
    modelConfidence: packet.sessionNarrative?.primaryModelDetection?.modelConfidence ?? packet.compactSummary.primaryModelDetection?.modelConfidence,
    modelReasons: packet.sessionNarrative?.primaryModelDetection?.modelReasons ?? packet.compactSummary.primaryModelDetection?.modelReasons,
    modelMissingEvidence: packet.sessionNarrative?.primaryModelDetection?.missingEvidence ?? packet.compactSummary.primaryModelDetection?.missingEvidence,
    sessionMitigationDetected: packet.sessionNarrative?.mitigationContext.detected ?? packet.compactSummary.sessionMitigationDetected,
    fvgTargetDetected: packet.sessionNarrative?.fvgTarget?.detected ?? packet.compactSummary.fvgTargetDetected,
    fvgTargetDirection: packet.sessionNarrative?.fvgTarget?.direction ?? packet.compactSummary.fvgTargetDirection,
    dataDepthStatus: packet.sessionNarrative?.dataDepth.status ?? packet.compactSummary.dataDepthStatus,
    availableLookbackDays: packet.sessionNarrative?.dataDepth.availableLookbackDays ?? packet.compactSummary.availableLookbackDays,
    requestedLookbackDays: packet.sessionNarrative?.dataDepth.requestedLookbackDays ?? packet.compactSummary.requestedLookbackDays,
    sessionTopReasons: packet.sessionNarrative?.topReasons ?? packet.compactSummary.sessionTopReasons,
    topReasons: reasons.length
      ? reasons
      : recommended.decision === "research_only"
        ? ["Research candidate generated; validation is still required before any readiness review."]
        : ["No explicit blocker was provided by the compact advisor packet."],
    nextAction: nextActionFor(packet, reasons),
    debug: {
      candleCount: packet.activeSource.candleCount,
      primaryTimeframeAvailable: packet.activeSource.candleCount > 0,
      htfTimeframesAvailable: packet.htfTimeframes,
      phase1SignalCount: phase1Signals.length,
      phase2SignalCount: phase2Signals.length,
      approvedStatus: packet.approvedProfileDecision.status,
      rejectionReasonsCount: packet.approvedProfileDecision.rejectionReasons.length,
      noTradeReasonsCount: recommended.noTradeReasons.length,
      lastEvaluationAt: packet.generatedAt,
      packetSource,
      sourceFingerprint: packet.activeSource.sourceFingerprint,
      journalStatus: packet.journalStatus
    },
    authority,
    safety
  };
};

export const buildIctCurrentReadFromRuntime = async (
  snapshot: ResearchRuntimeSnapshot,
  latestState?: IctLatestResearchState
) => buildIctCurrentReadFromPacket(await buildIctAdvisorPacketFromRuntime(snapshot), latestState);

export const assertIctCurrentReadIsCompact = (read: IctCurrentRead) => {
  const serialized = JSON.stringify(read);
  return {
    ok:
      read.researchOnly === true &&
      read.authority.executionAuthority === "none" &&
      read.authority.brokerAuthority === "none" &&
      read.authority.readinessOverrideAuthority === "none" &&
      read.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"account(Data|Number)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
