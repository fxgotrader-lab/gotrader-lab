import type { ResearchRuntimeSnapshot } from "../runtime";
import { buildIctAdvisorPacketFromRuntime } from "./ictAdvisorEngine";
import type { IctAdvisorPacket, IctAdvisorSignal } from "./ictAdvisorTypes";
import { detectIctOpportunities } from "./ictOpportunityDetection";
import type { IctDetectedOpportunity } from "./ictOpportunityDetectionTypes";
import { buildIctResearchHypothesisFromOpportunity } from "./ictSelfImprovement";
import { buildIctUniversalRecognition } from "./ictUniversalRecognition";
import type { IctUniversalRecognitionResult } from "./ictUniversalRecognitionTypes";
import type { IctLatestResearchState } from "./ictLatestResearchStateTypes";
import type {
  IctCurrentRead,
  IctCurrentReadDataStatus,
  IctModelQualityLane,
  IctCurrentReadPacketSource,
  IctPaperSimEligibilityStatus,
  IctReadinessSummary
} from "./ictCurrentReadTypes";
import type { IctAnalysisTimeframe } from "./ictMarketAnalysisContextTypes";

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

const CMD_MODEL_NAME = "consolidation_manipulation_distribution";
const CMD_INDEPENDENT_DATE_BLOCKER =
  "CMD lane is promising but date-concentrated; needs independent-date validation.";
const CMD_INDEPENDENT_DATE_NEXT_ACTION =
  "Run independent-date CMD validation over 90-day history.";

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
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

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
    latestMonteCarloGeneratedAt: latestMonteCarlo?.generatedAt,
    latestMonteCarloUsableOutcomes: latestMonteCarlo?.usableOutcomes,
    latestMonteCarloStatus: latestMonteCarlo ? "saved" as const : "missing" as const,
    latestMonteCarloReason: latestMonteCarlo
      ? `Saved Monte Carlo ${latestMonteCarlo.robustnessRating}; ${latestMonteCarlo.usableOutcomes} usable outcomes.`
      : "No saved Monte Carlo - run replay then Monte Carlo.",
    recommendedMaxRiskStatus: typeof latestMonteCarlo?.recommendedMaxRiskPerTradePct === "number"
      ? "available" as const
      : "unavailable" as const,
    recommendedMaxRiskReason: typeof latestMonteCarlo?.recommendedMaxRiskPerTradePct === "number"
      ? "Recommended max risk comes from the latest saved Monte Carlo summary."
      : "Recommended max risk unavailable - no saved Monte Carlo.",
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
  if (lane === "paper_watchlist" && modelName === CMD_MODEL_NAME) {
    return `CMD paper-watchlist - paper-test only. ${CMD_INDEPENDENT_DATE_BLOCKER}`;
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

const analysisTimeframesFor = (packet: IctAdvisorPacket) =>
  packet.marketAnalysisContext?.analysisTimeframesUsed ??
  packet.compactSummary.analysisTimeframesUsed ??
  packet.htfTimeframes.map((timeframe): IctAnalysisTimeframe | undefined =>
    timeframe.toLowerCase() === "15m"
      ? "M15"
      : timeframe.toLowerCase() === "1h"
        ? "H1"
        : timeframe.toLowerCase() === "4h"
          ? "H4"
          : timeframe.toLowerCase() === "1d"
            ? "D1"
            : timeframe.toLowerCase() === "1w"
              ? "W1"
              : undefined
  ).filter((timeframe): timeframe is IctAnalysisTimeframe => Boolean(timeframe));

const missingTimeframesFor = (packet: IctAdvisorPacket) =>
  packet.marketAnalysisContext?.missingTimeframes ?? packet.compactSummary.missingTimeframes ?? [];

const analysisDepthStatusFor = (packet: IctAdvisorPacket) =>
  packet.marketAnalysisContext?.analysisDepthStatus ?? packet.compactSummary.analysisDepthStatus;

const confidenceWithAnalysisPenalty = (confidence: number | undefined, missingTimeframes: string[], analysisTimeframesUsed: string[]) => {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return confidence;
  const missingPenalty = Math.min(0.18, missingTimeframes.length * 0.025);
  const singleFramePenalty = analysisTimeframesUsed.length <= 1 ? 0.1 : 0;
  return Math.max(0, Number((confidence - missingPenalty - singleFramePenalty).toFixed(4)));
};

const isDirectionalSide = (side?: string) => side === "long" || side === "short";

const paperSimEligibilityFor = (input: {
  approvedStatus?: string;
  modelQualityLane?: IctModelQualityLane;
  side?: string;
  target?: number;
  invalidation?: number;
  rrEstimate?: number;
  confidence?: number;
  riskStatus?: string;
}): {
  paperOnly: boolean;
  paperSimAllowed: boolean;
  paperSimEligibilityReason: string;
  paperSimEligibilityStatus: IctPaperSimEligibilityStatus;
} => {
  const isApproved = input.approvedStatus === "approved_research_candidate" || input.modelQualityLane === "approved";
  const isPaperWatchlist = input.approvedStatus === "paper_watchlist_candidate" || input.modelQualityLane === "paper_watchlist";
  const blockers = [
    !isApproved && !isPaperWatchlist ? "Only approved research signals or explicit paper-watchlist candidates are eligible." : undefined,
    !isDirectionalSide(input.side) ? "Signal side must be long or short." : undefined,
    !finite(input.target) ? "Missing target." : undefined,
    !finite(input.invalidation) ? "Missing invalidation." : undefined,
    !finite(input.rrEstimate) ? "Missing RR estimate." : undefined,
    !finite(input.confidence) ? "Missing confidence." : undefined,
    /reject|blocked|avoid/i.test(input.riskStatus ?? "") ? `Risk governor blocks candidate: ${input.riskStatus}.` : undefined
  ].filter((value): value is string => Boolean(value));
  const paperOnly = isPaperWatchlist;
  if (!blockers.length) {
    return {
      paperOnly,
      paperSimAllowed: true,
      paperSimEligibilityStatus: "eligible",
      paperSimEligibilityReason: paperOnly
        ? "Paper-only eligible from explicit paper-watchlist candidate."
        : "Eligible for paper simulation from approved research signal."
    };
  }
  return {
    paperOnly,
    paperSimAllowed: false,
    paperSimEligibilityStatus: isApproved || isPaperWatchlist ? "partial" : "not_eligible",
    paperSimEligibilityReason: blockers[0]
  };
};

const readinessSummaryFor = (input: {
  analysisDepthStatus?: string;
  dataStatus?: IctCurrentReadDataStatus;
  missingTimeframes?: string[];
  modelDetectionStatus?: "detected" | "not_detected" | "not_run";
  paperSimAllowed: boolean;
  paperSimEligibilityStatus: IctPaperSimEligibilityStatus;
  paperSimEligibilityReason: string;
  requiredTimeframesLoaded?: boolean;
  riskStatus?: string;
  smtStatus?: string;
}): IctReadinessSummary => {
  const reasons = uniqueReasons([
    input.dataStatus !== "ready" ? `Current read data is ${input.dataStatus ?? "unknown"}.` : undefined,
    input.requiredTimeframesLoaded === false ? "M5/M15 required analysis context is incomplete." : undefined,
    input.missingTimeframes?.length ? `Missing analysis timeframes: ${input.missingTimeframes.join(", ")}.` : undefined,
    input.analysisDepthStatus && input.analysisDepthStatus !== "sufficient" ? `Analysis depth is ${input.analysisDepthStatus}.` : undefined,
    input.modelDetectionStatus !== "detected" ? "No complete session model detected." : undefined,
    /comparison_sources_missing|insufficient|missing|unavailable/i.test(input.smtStatus ?? "") ? "SMT/relative-strength context is incomplete." : undefined,
    /unknown|unavailable/i.test(input.riskStatus ?? "") ? "News/session risk context is incomplete." : undefined,
    input.paperSimAllowed ? undefined : input.paperSimEligibilityReason,
    "Execution readiness is disabled by design."
  ]);
  const usableResearch = input.dataStatus === "ready" && input.modelDetectionStatus !== "not_run";
  const researchReadiness =
    !usableResearch
      ? "not_ready"
      : reasons.some((reason) => /M5\/M15|Missing analysis|depth|No complete|SMT|risk context/i.test(reason))
        ? "partial"
        : "ready";
  const paperReadiness = input.paperSimAllowed
    ? "eligible"
    : input.paperSimEligibilityStatus === "partial"
      ? "partial"
      : "not_eligible";
  return {
    researchReadiness,
    paperReadiness,
    executionReadiness: "disabled",
    reasons
  };
};

const nextActionFor = (packet: IctAdvisorPacket, reasons: string[]) => {
  const status = packet.approvedProfileDecision.status;
  const modelName = primaryModelNameFor(packet);
  if (!packet.activeSource.candleCount) return "Check MT5 Read Only or activate a canonical research source.";
  if (!packet.htfTimeframes.length) return "Fetch 15m and 1h MT5 context before trusting the current read.";
  if (status === "approved_research_candidate") return "Run replay and walk-forward before any readiness review.";
  if (status === "paper_watchlist_candidate" && modelName === CMD_MODEL_NAME) return CMD_INDEPENDENT_DATE_NEXT_ACTION;
  if (status === "paper_watchlist_candidate") return "Paper-watchlist only: run explicit paper simulation and collect replay evidence; no readiness promotion.";
  if (status === "watchlist_candidate") return "Keep on watchlist and test the blocking evidence with replay.";
  if (reasons.some((reason) => /rr|target/i.test(reason))) return "Wait for a cleaner target and RR profile.";
  if (reasons.some((reason) => /fvg|displacement/i.test(reason))) return "Wait for displacement/FVG evidence before retesting.";
  if (reasons.some((reason) => /smt|relative strength/i.test(reason))) return "Fetch or compare correlated index context for SMT confirmation.";
  if (reasons.some((reason) => /news|session/i.test(reason))) return "Wait until news/session risk clears.";
  return "Continue observation; current setup is not an approved research candidate.";
};

const sessionCandlesCountFor = (packet: IctAdvisorPacket) =>
  packet.sessionNarrative?.ranges?.reduce((sum, range) => sum + range.candleCount, 0) ?? 0;

const modelDetectionStatusFor = (packet: IctAdvisorPacket) => {
  const model = packet.sessionNarrative?.primaryModelDetection ?? packet.compactSummary.primaryModelDetection;
  if (!packet.sessionNarrative) return "not_run" as const;
  return model?.modelDetected ? "detected" as const : "not_detected" as const;
};

const fvgTargetReasonFor = (packet: IctAdvisorPacket) => {
  if (packet.sessionNarrative?.fvgTarget?.note) return packet.sessionNarrative.fvgTarget.note;
  const fvgReason = packet.sessionNarrative?.noTradeReasons.find((reason) => /fvg|draw target/i.test(reason));
  if (fvgReason) return fvgReason;
  if (!packet.sessionNarrative) return packet.compactSummary.hydrationWarning ?? "Session narrative did not run because no hydrated candles were available.";
  return "No premium/discount FVG draw target was detected in the selected session window.";
};

const targetReasonFor = (signal: IctAdvisorSignal, packet: IctAdvisorPacket) => {
  if (finite(signal.target)) return "Target constructed from compact liquidity/FVG context.";
  if (!packet.sessionNarrative) return packet.compactSummary.hydrationWarning ?? "No hydrated session candles were available for target construction.";
  if (!signal.drawOnLiquidity && !packet.sessionNarrative.fvgTarget?.detected) {
    return "Missing liquidity or FVG draw target for the selected model.";
  }
  return signal.noTradeReasons.find((reason) => /target|liquidity|fvg/i.test(reason)) ?? "No valid compact target was produced for this candidate.";
};

const invalidationReasonFor = (signal: IctAdvisorSignal, packet: IctAdvisorPacket) => {
  if (finite(signal.invalidation)) return "Invalidation constructed from compact structure/session range context.";
  if (!packet.sessionNarrative) return packet.compactSummary.hydrationWarning ?? "No hydrated session candles were available for invalidation construction.";
  if (!signal.entryZone && !signal.liquiditySwept && !packet.sessionNarrative.activeDealingRange) {
    return "Missing structural invalidation context: no entry zone, sweep, or active dealing range.";
  }
  return signal.noTradeReasons.find((reason) => /invalidation|structure|entry|range/i.test(reason)) ?? "No valid compact structural invalidation was produced.";
};

const rrReasonFor = (signal: IctAdvisorSignal) => {
  if (finite(signal.rrEstimate)) return "RR estimate constructed from target and invalidation.";
  if (!finite(signal.target) || !finite(signal.invalidation)) return "RR unavailable because target or invalidation is missing.";
  return signal.noTradeReasons.find((reason) => /rr|reward|risk/i.test(reason)) ?? "RR estimate was not available for this candidate.";
};

const smtStatusFor = (signal: IctAdvisorSignal): string => {
  if (!signal.smt) return "comparison_sources_missing";
  if (signal.smt.rejectsCandidate) return "rejects_candidate";
  if (signal.smt.confirmsCandidate) return "confirms_candidate";
  if (signal.smt.divergenceType === "insufficient_data") return "insufficient_data";
  return signal.smt.divergenceType ?? "no_smt";
};

const smtReasonFor = (signal: IctAdvisorSignal, packet: IctAdvisorPacket) => {
  if (signal.smt?.reason) return signal.smt.reason;
  if (packet.activeSource.provider === "mt5_read_only") {
    return "SMT comparison sources are missing or not hydrated for the active MT5 read-only window.";
  }
  return "No SMT comparison source was available for this compact read.";
};

const riskStatusFor = (signal: IctAdvisorSignal): string => {
  const risk = signal.newsSessionRisk;
  if (!risk) return "unknown_no_calendar";
  if (risk.riskGovernorAction === "allow") return "clear";
  if (risk.riskGovernorAction === "downgrade_to_watchlist" || risk.sessionRiskState === "caution") return "caution";
  if (risk.riskGovernorAction === "reject_candidate" || risk.riskGovernorAction === "no_trade" || risk.sessionRiskState === "avoid") {
    return "blocked";
  }
  return risk.riskGovernorAction ?? "unavailable";
};

const riskReasonFor = (signal: IctAdvisorSignal) => {
  if (signal.newsSessionRisk?.newsSessionRiskNotes?.length) {
    return signal.newsSessionRisk.newsSessionRiskNotes.slice(0, 2).join("; ");
  }
  if (!signal.newsSessionRisk) return "No news/session calendar context is available; treat risk as unknown/caution.";
  return "Session/news risk governor reviewed this candidate with compact context only.";
};

const noOpportunity = (generatedAt = new Date().toISOString()) =>
  detectIctOpportunities({ generatedAt })[0]!;

const unavailableRecognition = (generatedAt = new Date().toISOString()) =>
  buildIctUniversalRecognition({ generatedAt });

const recognizedFallbackOpportunity = (
  recognition: IctUniversalRecognitionResult,
  packet: IctAdvisorPacket
): IctDetectedOpportunity | undefined => {
  if (recognition.tier !== "scalp_setup" && recognition.tier !== "pd_array_setup") return undefined;
  const scalp = recognition.scalpOpportunity;
  const pdArray = recognition.pdArrays[0];
  return {
    researchOnly: true,
    opportunityId: `ict_universal_${recognition.tier}_${packet.activeSource.sourceFingerprint || packet.packetId}`,
    generatedAt: recognition.generatedAt,
    type: recognition.tier === "scalp_setup" ? "liquidity_raid" : "retracement_to_pd_array",
    stage: scalp?.status === "scalp_candidate" ? "triggered" : "forming",
    quality: scalp?.status === "scalp_candidate" ? "medium" : "low",
    modelName: recognition.knownModel?.modelName,
    modelFamily: "ICT",
    direction: scalp?.direction ?? recognition.knownModel?.direction ?? "neutral",
    marketCycleStage: recognition.marketCycleStage === "range_bound"
      ? "unknown"
      : recognition.marketCycleStage === "accumulation_manipulation_expansion"
        ? "expansion"
        : recognition.marketCycleStage === "consolidation_manipulation_distribution"
          ? "consolidation"
          : recognition.marketCycleStage === "ny_session_reversal_to_premium_fvg" || recognition.marketCycleStage === "ny_session_reversal_from_premium_to_discount"
            ? "reversal"
            : "unknown",
    liquidityObjective: scalp?.liquidityDraw
      ? {
          side: scalp.liquidityDraw.side,
          target: scalp.liquidityDraw.level,
          source: "universal_recognition",
          reason: scalp.liquidityDraw.reason
        }
      : undefined,
    pdArrayContext: recognition.pdArrays.slice(0, 4).map((array) => ({
      type: array.type,
      role: array.role === "draw" ? "target" : array.role,
      high: array.high,
      low: array.low,
      reason: array.reason
    })),
    tradeIdea: scalp
      ? {
          side: scalp.side,
          target: scalp.target,
          invalidation: scalp.invalidation,
          rrEstimate: scalp.rrEstimate,
          confidence: scalp.confidence
        }
      : undefined,
    confirmationNeeded: recognition.missingEvidence.slice(0, 8),
    missingEvidence: recognition.missingEvidence.slice(0, 8),
    blockers: recognition.blockers.slice(0, 8),
    laneRecommendation: recognition.laneRecommendation,
    nextAction: recognition.nextAction,
    authority,
    safety
  };
};

export const buildUnavailableIctCurrentRead = (
  reason = "Active ICT advisor packet is unavailable.",
  latestState?: IctLatestResearchState
): IctCurrentRead => {
  const opportunity = noOpportunity();
  const universalRecognition = unavailableRecognition();
  return ({
  researchOnly: true,
  packetSource: "unavailable",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  displayTimeframe: "5m",
  displayTimeframeRole: "chart_display_reference_only",
  analysisTimeframesUsed: [],
  analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
  analysisTimeframesLoaded: [],
  requiredTimeframesLoaded: false,
  analysisDepthStatus: "unavailable",
  multiTimeframeContextStatus: "unavailable",
  missingTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"],
  htfBiasSource: [],
  sessionModelSourceTimeframe: undefined,
  confirmationSourceTimeframe: undefined,
  weeklyBiasStatus: "unavailable",
  weeklyBiasDirection: "unknown",
  weeklyBiasReason: "W1 context unavailable from MT5 range endpoint.",
  htfTimeframes: [],
  dataStatus: "unavailable",
  side: "flat",
  approvedStatus: "no_trade",
  modelQualityLane: "no_trade",
  universalRecognition,
  recognitionTier: universalRecognition.tier,
  scalpStatus: universalRecognition.scalpOpportunity?.status,
  scalpDirection: universalRecognition.scalpOpportunity?.direction,
  scalpTarget: universalRecognition.scalpOpportunity?.target,
  scalpInvalidation: universalRecognition.scalpOpportunity?.invalidation,
  scalpRR: universalRecognition.scalpOpportunity?.rrEstimate,
  pdArrayFocus: universalRecognition.pdArrays[0] ? `${universalRecognition.pdArrays[0].type} / ${universalRecognition.pdArrays[0].role}` : undefined,
  recognitionOpportunitySummary: universalRecognition.opportunitySummary,
  opportunitySummary: universalRecognition.opportunitySummary,
  opportunity,
  opportunityDetected: false,
  opportunityType: opportunity.type,
  opportunityStage: opportunity.stage,
  opportunityQuality: opportunity.quality,
  opportunityDirection: opportunity.direction,
  opportunityModelName: opportunity.modelName,
  opportunityLaneRecommendation: opportunity.laneRecommendation,
  opportunityNextAction: opportunity.nextAction,
  opportunityMissingEvidence: opportunity.missingEvidence,
  opportunityBlockers: [reason, ...opportunity.blockers].slice(0, 8),
  opportunityTradeIdea: opportunity.tradeIdea,
  selfImprovementHypothesis: undefined,
  selfImprovementHypothesisQueued: false,
  selfImprovementHypothesisStatus: undefined,
  selfImprovementHypothesisReason: "Data is insufficient for a research hypothesis.",
  selfImprovementNextValidation: "Activate MT5 read-only market data, then rerun Activate Market.",
  paperWatchlistEligible: false,
  paperWatchlistReason: reason,
  paperWatchlistEvidenceSummary: "No compact ICT model-quality evidence is available.",
  paperSimEligibilityStatus: "not_eligible",
  paperSimEligibilityReason: reason,
  paperSimAllowed: false,
  paperOnly: false,
  readinessSummary: {
    researchReadiness: "not_ready",
    paperReadiness: "not_eligible",
    executionReadiness: "disabled",
    reasons: [reason, "Execution readiness is disabled by design."]
  },
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
    packetSource: "unavailable",
    selectedSessionMode: "unavailable",
    sessionCandlesCount: 0,
    sessionNarrativeStatus: "insufficient_data",
    modelDetectorUsed: "not_run_no_packet",
    opportunityDetectorUsed: "ict_opportunity_detector_v1_no_data",
    universalRecognitionTier: universalRecognition.tier,
    scalpStatus: universalRecognition.scalpOpportunity?.status,
    pdArrayCount: universalRecognition.pdArrays.length,
    opportunityType: opportunity.type,
    opportunityStage: opportunity.stage,
    opportunityQuality: opportunity.quality,
    opportunityLaneRecommendation: opportunity.laneRecommendation,
    selfImprovementHypothesisStatus: undefined,
    selfImprovementHypothesisReason: "Data is insufficient for a research hypothesis.",
    fvgTargetStatus: "missing",
    targetConstructionStatus: "missing",
    invalidationConstructionStatus: "missing",
    rrConstructionStatus: "missing",
    smtStatus: "comparison_sources_missing",
    riskStatus: "unknown_no_calendar",
    hydrationSource: "unavailable",
    hydrationWarning: reason,
    displayTimeframe: "5m",
    analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
    analysisTimeframesLoaded: [],
    requiredTimeframesLoaded: false,
    analysisTimeframesUsed: [],
    analysisDepthStatus: "unavailable",
    multiTimeframeContextStatus: "unavailable",
    missingTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"],
    htfBiasSource: [],
    sessionModelSourceTimeframe: undefined,
    confirmationSourceTimeframe: undefined,
    weeklyBiasStatus: "unavailable",
    weeklyBiasDirection: "unknown",
    weeklyBiasReason: "W1 context unavailable from MT5 range endpoint."
  },
  ...latestResearchSummaryFor(latestState),
  authority,
  safety
});
};

export const buildIctCurrentReadFromPacket = (packet?: IctAdvisorPacket, latestState?: IctLatestResearchState): IctCurrentRead => {
  if (!packet) return buildUnavailableIctCurrentRead(undefined, latestState);
  const phase1Signals = packet.signals.filter((signal) => signal.phase === "phase_1");
  const phase2Signals = packet.signals.filter((signal) => signal.phase === "phase_2");
  const bestPhase1 = bestSignalFrom(phase1Signals);
  const bestPhase2 = bestSignalFrom(phase2Signals);
  const recommended = packet.recommendedSignal;
  const sessionNarrativeProfile =
    packet.sessionNarrative?.profile ??
    packet.compactSummary.sessionNarrativeProfile ??
    (packet.activeSource.candleCount > 0 ? "unknown" : "insufficient_data");
  const sessionNarrativeStatus = sessionNarrativeProfile;
  const modelDetectionStatus = modelDetectionStatusFor(packet);
  const fvgTargetDetected = packet.sessionNarrative?.fvgTarget?.detected ?? packet.compactSummary.fvgTargetDetected ?? false;
  const fvgTargetDirection = packet.sessionNarrative?.fvgTarget?.direction ?? packet.compactSummary.fvgTargetDirection ?? "unknown";
  const fvgTargetStatus = fvgTargetDetected ? "detected" as const : "missing" as const;
  const fvgTargetReason = fvgTargetReasonFor(packet);
  const targetConstructionStatus = finite(recommended.target) ? "constructed" as const : "missing" as const;
  const targetConstructionReason = targetReasonFor(recommended, packet);
  const invalidationConstructionStatus = finite(recommended.invalidation) ? "constructed" as const : "missing" as const;
  const invalidationConstructionReason = invalidationReasonFor(recommended, packet);
  const rrConstructionStatus = finite(recommended.rrEstimate) ? "constructed" as const : "missing" as const;
  const rrConstructionReason = rrReasonFor(recommended);
  const smtStatus = smtStatusFor(recommended);
  const smtReason = smtReasonFor(recommended, packet);
  const riskStatus = riskStatusFor(recommended);
  const riskReason = riskReasonFor(recommended);
  const htfAlignment =
    packet.approvedProfileDecision.htfAlignment ??
    recommended.htfAlignment ??
    packet.compactSummary.htfAlignment;
  const reasons = uniqueReasons([
    packet.activeSource.candleCount <= 0 ? "Missing candle data from active canonical research source." : undefined,
    packet.htfTimeframes.length === 0 ? "Missing higher-timeframe context for the current advisor read." : undefined,
    htfAlignment && htfAlignment.alignmentStatus !== "aligned" && htfAlignment.alignmentStatus !== "not_required_for_model"
      ? `HTF alignment ${htfAlignment.alignmentStatus}: ${htfAlignment.conflictReason} ${htfAlignment.modelAllowanceReason}`
      : undefined,
    packet.compactSummary.hydrationWarning,
    !packet.sessionNarrative && packet.activeSource.candleCount > 0 ? "Session narrative did not run; compact MT5 candles were not hydrated into the advisor engine." : undefined,
    ...packet.approvedProfileDecision.rejectionReasons,
    ...packet.approvedProfileDecision.watchlistReasons,
    ...recommended.noTradeReasons,
    ...(recommended.newsSessionRisk?.newsSessionRiskNotes ?? []),
    recommended.smt?.reason,
    ...(packet.sessionNarrative?.topReasons ?? []),
    ...(packet.sessionNarrative?.primaryModelDetection?.modelReasons ?? []),
    ...(packet.sessionNarrative?.primaryModelDetection?.missingEvidence?.map((reason) => `Model missing evidence: ${reason}.`) ?? []),
    fvgTargetDetected ? packet.sessionNarrative?.fvgTarget?.note : fvgTargetReason,
    targetConstructionStatus === "missing" ? targetConstructionReason : undefined,
    invalidationConstructionStatus === "missing" ? invalidationConstructionReason : undefined,
    rrConstructionStatus === "missing" ? rrConstructionReason : undefined,
    smtStatus === "comparison_sources_missing" || smtStatus === "insufficient_data" ? smtReason : undefined,
    riskStatus === "unknown_no_calendar" || riskStatus === "unavailable" ? riskReason : undefined,
    packet.sessionNarrative?.dataDepth.status !== "sufficient" ? packet.sessionNarrative?.dataDepth.note : undefined
  ]);
  const packetSource = packetSourceFor(packet);
  const dataStatus = dataStatusFor(packet);
  const modelQualityLane = modelQualityLaneFor(packet.approvedProfileDecision.status);
  const primaryOpportunity = detectIctOpportunities({
    packet,
    sessionNarrative: packet.sessionNarrative,
    recommendedSignal: recommended,
    approvedStatus: packet.approvedProfileDecision.status,
    generatedAt: packet.generatedAt,
    sourceFingerprint: packet.activeSource.sourceFingerprint
  })[0] ?? noOpportunity(packet.generatedAt);
  const universalRecognition = buildIctUniversalRecognition({
    packet,
    sessionNarrative: packet.sessionNarrative,
    recommendedSignal: recommended,
    approvedStatus: packet.approvedProfileDecision.status,
    primaryOpportunity,
    generatedAt: packet.generatedAt
  });
  const recognizedOpportunity =
    primaryOpportunity.type === "none" || primaryOpportunity.stage === "insufficient_data"
      ? recognizedFallbackOpportunity(universalRecognition, packet) ?? primaryOpportunity
      : primaryOpportunity;
  const opportunityDetected = recognizedOpportunity.type !== "none" && recognizedOpportunity.stage !== "insufficient_data";
  const opportunityApprovalNote = opportunityDetected && modelQualityLane !== "approved"
    ? `Opportunity detected, but not approved because ${recognizedOpportunity.blockers[0] ?? recognizedOpportunity.missingEvidence[0] ?? recognizedOpportunity.confirmationNeeded[0] ?? "approval evidence is incomplete"}.`
    : undefined;
  const selfImprovementDecision = buildIctResearchHypothesisFromOpportunity({
    opportunity: recognizedOpportunity,
    approvedStatus: packet.approvedProfileDecision.status,
    modelQualityLane,
    dataStatus,
    requestedSymbol: packet.requestedSymbol,
    brokerSymbol: packet.brokerSymbol,
    primaryTimeframe: packet.primaryTimeframe,
    sourceFingerprint: packet.activeSource.sourceFingerprint,
    candleCount: packet.activeSource.candleCount,
    topReasons: uniqueReasons([universalRecognition.opportunitySummary, ...reasons]),
    generatedAt: packet.generatedAt
  });
  const selfImprovementHypothesis = selfImprovementDecision.ok ? selfImprovementDecision.hypothesis : undefined;
  const selfImprovementNote = selfImprovementDecision.ok
    ? "Research hypothesis queued - needs replay validation."
    : selfImprovementDecision.reason;
  const paperWatchlistEligible = modelQualityLane === "paper_watchlist";
  const paperWatchlistReason = paperWatchlistReasonFor(packet, modelQualityLane, reasons);
  const paperWatchlistEvidenceSummary = paperWatchlistEvidenceSummaryFor(packet, modelQualityLane);
  const paperWatchlistModelName = primaryModelNameFor(packet);
  const cmdIndependentDateGateRequired =
    modelQualityLane === "paper_watchlist" && paperWatchlistModelName === CMD_MODEL_NAME;
  const cmdIndependentDateGateStatus = cmdIndependentDateGateRequired ? "overfit_risk" as const : undefined;
  const cmdIndependentDateGateReason = cmdIndependentDateGateRequired ? CMD_INDEPENDENT_DATE_BLOCKER : undefined;
  const cmdIndependentDateGateNextAction = cmdIndependentDateGateRequired ? CMD_INDEPENDENT_DATE_NEXT_ACTION : undefined;
  const analysisTimeframesUsed = analysisTimeframesFor(packet);
  const missingTimeframes = missingTimeframesFor(packet);
  const analysisTimeframesRequested = packet.marketAnalysisContext?.analysisTimeframesRequested ?? ["W1", "D1", "H4", "H1", "M15", "M5"];
  const analysisTimeframesLoaded = packet.marketAnalysisContext?.analysisTimeframesLoaded ?? analysisTimeframesUsed;
  const requiredTimeframesLoaded = packet.marketAnalysisContext?.requiredTimeframesLoaded ?? (analysisTimeframesUsed.includes("M5") && analysisTimeframesUsed.includes("M15"));
  const analysisDepthStatus = analysisDepthStatusFor(packet) ?? packet.sessionNarrative?.dataDepth.status ?? packet.compactSummary.dataDepthStatus;
  const multiTimeframeContextStatus = packet.marketAnalysisContext?.multiTimeframeContextStatus;
  const displayTimeframe = packet.marketAnalysisContext?.displayTimeframe ?? packet.compactSummary.displayTimeframe ?? packet.primaryTimeframe;
  const htfBiasSource = packet.marketAnalysisContext?.htfBiasSource ?? packet.compactSummary.htfBiasSource ?? [];
  const sessionModelSourceTimeframe =
    packet.marketAnalysisContext?.sessionModelSourceTimeframe ?? packet.compactSummary.sessionModelSourceTimeframe;
  const confirmationSourceTimeframe =
    packet.marketAnalysisContext?.confirmationSourceTimeframe ?? packet.compactSummary.confirmationSourceTimeframe;
  const weeklyBiasStatus = packet.marketAnalysisContext?.weeklyBiasStatus;
  const weeklyBiasDirection = packet.marketAnalysisContext?.weeklyBiasDirection;
  const weeklyBiasReason = packet.marketAnalysisContext?.weeklyBiasReason;
  const adjustedConfidence = confidenceWithAnalysisPenalty(recommended.confidence, missingTimeframes, analysisTimeframesUsed);
  const paperSim = paperSimEligibilityFor({
    approvedStatus: packet.approvedProfileDecision.status,
    confidence: recommended.confidence,
    invalidation: recommended.invalidation,
    modelQualityLane,
    riskStatus,
    rrEstimate: recommended.rrEstimate,
    side: recommended.side,
    target: recommended.target
  });
  const readinessSummary = readinessSummaryFor({
    analysisDepthStatus,
    dataStatus,
    missingTimeframes,
    modelDetectionStatus,
    paperSimAllowed: paperSim.paperSimAllowed,
    paperSimEligibilityReason: paperSim.paperSimEligibilityReason,
    paperSimEligibilityStatus: paperSim.paperSimEligibilityStatus,
    requiredTimeframesLoaded,
    riskStatus,
    smtStatus
  });
  const multiTimeframeReasons = uniqueReasons([
    analysisTimeframesUsed.length <= 1 ? "Multi-timeframe context incomplete." : undefined,
    missingTimeframes.length ? `Missing analysis timeframes: ${missingTimeframes.join(", ")}.` : undefined,
    analysisDepthStatus && analysisDepthStatus !== "sufficient" ? `Analysis depth is ${analysisDepthStatus}.` : undefined
  ]);

  return {
    researchOnly: true,
    packetSource,
    requestedSymbol: packet.requestedSymbol,
    brokerSymbol: packet.brokerSymbol,
    primaryTimeframe: packet.primaryTimeframe,
    displayTimeframe,
    displayTimeframeRole: "chart_display_reference_only",
    analysisTimeframesRequested,
    analysisTimeframesLoaded,
    requiredTimeframesLoaded,
    analysisTimeframesUsed,
    analysisDepthStatus,
    multiTimeframeContextStatus,
    missingTimeframes,
    htfBiasSource,
    sessionModelSourceTimeframe,
    confirmationSourceTimeframe,
    weeklyBiasStatus,
    weeklyBiasDirection,
    weeklyBiasReason,
    htfTimeframes: packet.htfTimeframes,
    htfAlignment,
    dataStatus,
    candleCount: packet.activeSource.candleCount,
    htfStatus: htfStatusFor(packet),
    bestPhase1Setup: bestPhase1?.setup,
    bestPhase2Setup: bestPhase2?.setup,
    bestSetup: recommended.setup,
    side: recommended.side,
    approvedStatus: packet.approvedProfileDecision.status,
    modelQualityLane,
    universalRecognition,
    recognitionTier: universalRecognition.tier,
    knownModelName: universalRecognition.knownModel?.modelName,
    knownModelState: universalRecognition.knownModel?.state,
    scalpStatus: universalRecognition.scalpOpportunity?.status,
    scalpDirection: universalRecognition.scalpOpportunity?.direction,
    scalpTarget: universalRecognition.scalpOpportunity?.target,
    scalpInvalidation: universalRecognition.scalpOpportunity?.invalidation,
    scalpRR: universalRecognition.scalpOpportunity?.rrEstimate,
    pdArrayFocus: universalRecognition.pdArrays[0] ? `${universalRecognition.pdArrays[0].type} / ${universalRecognition.pdArrays[0].role}` : undefined,
    recognitionOpportunitySummary: universalRecognition.opportunitySummary,
    opportunitySummary: universalRecognition.opportunitySummary,
    opportunityDetected,
    opportunity: recognizedOpportunity,
    opportunityType: recognizedOpportunity.type,
    opportunityStage: recognizedOpportunity.stage,
    opportunityQuality: recognizedOpportunity.quality,
    opportunityDirection: recognizedOpportunity.direction,
    opportunityModelName: recognizedOpportunity.modelName,
    opportunityLaneRecommendation: recognizedOpportunity.laneRecommendation,
    opportunityNextAction: recognizedOpportunity.nextAction,
    opportunityMissingEvidence: recognizedOpportunity.missingEvidence,
    opportunityBlockers: recognizedOpportunity.blockers,
    opportunityTradeIdea: recognizedOpportunity.tradeIdea,
    selfImprovementHypothesis,
    selfImprovementHypothesisQueued: Boolean(selfImprovementHypothesis),
    selfImprovementHypothesisStatus: selfImprovementHypothesis?.status,
    selfImprovementHypothesisReason: selfImprovementNote,
    selfImprovementNextValidation: selfImprovementHypothesis?.proposedValidationRules[0] ?? selfImprovementNote,
    paperWatchlistEligible,
    paperWatchlistModelName: paperWatchlistEligible ? paperWatchlistModelName : undefined,
    paperWatchlistReason,
    paperWatchlistEvidenceSummary,
    cmdIndependentDateGateRequired,
    cmdIndependentDateGateStatus,
    cmdIndependentDateGateReason,
    cmdIndependentDateGateNextAction,
    paperSimEligibilityStatus: paperSim.paperSimEligibilityStatus,
    paperSimEligibilityReason: paperSim.paperSimEligibilityReason,
    paperSimAllowed: paperSim.paperSimAllowed,
    paperOnly: paperSim.paperOnly,
    readinessSummary,
    executionAllowed: false,
    approvalScore: packet.approvedProfileDecision.approvalScore,
    confidence: adjustedConfidence,
    rrEstimate: recommended.rrEstimate,
    target: recommended.target,
    invalidation: recommended.invalidation,
    bias: recommended.bias.composite,
    smtStatus,
    riskStatus,
    dealingRangeLocation: recommended.dealingRange?.currentLocation,
    drawOnLiquidity: liquidityLabel(recommended.drawOnLiquidity),
    liquiditySwept: liquidityLabel(recommended.liquiditySwept),
    fvgStatus: fvgStatusFor(recommended),
    displacementStatus: displacementStatusFor(recommended),
    entryZone: entryZoneLabel(recommended.entryZone),
    ...latestResearchSummaryFor(latestState),
    sessionNarrativeProfile,
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
    fvgTargetDetected,
    fvgTargetDirection,
    dataDepthStatus: packet.sessionNarrative?.dataDepth.status ?? packet.compactSummary.dataDepthStatus,
    availableLookbackDays: packet.sessionNarrative?.dataDepth.availableLookbackDays ?? packet.compactSummary.availableLookbackDays,
    requestedLookbackDays: packet.sessionNarrative?.dataDepth.requestedLookbackDays ?? packet.compactSummary.requestedLookbackDays,
    sessionTopReasons: packet.sessionNarrative?.topReasons ?? packet.compactSummary.sessionTopReasons,
    sessionNarrativeStatus,
    modelDetectionStatus,
    fvgTargetStatus,
    fvgTargetReason,
    targetConstructionStatus,
    targetConstructionReason,
    invalidationConstructionStatus,
    invalidationConstructionReason,
    rrConstructionStatus,
    rrConstructionReason,
    smtReason,
    riskReason,
    topReasons: reasons.length
      ? uniqueReasons([universalRecognition.opportunitySummary, opportunityApprovalNote, cmdIndependentDateGateReason, selfImprovementHypothesis ? selfImprovementNote : undefined, ...multiTimeframeReasons, ...reasons])
      : recommended.decision === "research_only"
        ? uniqueReasons([universalRecognition.opportunitySummary, opportunityApprovalNote, cmdIndependentDateGateReason, selfImprovementHypothesis ? selfImprovementNote : undefined, ...multiTimeframeReasons, "Research candidate generated; validation is still required before any readiness review."])
        : uniqueReasons([universalRecognition.opportunitySummary, opportunityApprovalNote, cmdIndependentDateGateReason, selfImprovementHypothesis ? selfImprovementNote : undefined, ...multiTimeframeReasons, "No explicit blocker was provided by the compact advisor packet."]),
    nextAction: opportunityDetected && modelQualityLane !== "approved"
      ? selfImprovementHypothesis?.nextAction ?? recognizedOpportunity.nextAction
      : universalRecognition.tier === "pd_array_setup" || universalRecognition.tier === "scalp_setup"
        ? universalRecognition.nextAction
        : nextActionFor(packet, reasons),
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
      journalStatus: packet.journalStatus,
      selectedSessionDate: packet.sessionNarrative?.tradingDate,
      selectedSessionMode: packet.sessionNarrative
        ? "latest_completed_or_current_session_from_mt5_window"
        : "unavailable_no_hydrated_candles",
      sessionCandlesCount: sessionCandlesCountFor(packet),
      sessionNarrativeStatus,
      modelDetectorUsed: packet.sessionNarrative ? "ict_session_narrative_model_detector_v1" : "not_run_no_hydrated_candles",
      opportunityDetectorUsed: "ict_opportunity_detector_v1",
      universalRecognitionTier: universalRecognition.tier,
      scalpStatus: universalRecognition.scalpOpportunity?.status,
      pdArrayCount: universalRecognition.pdArrays.length,
      opportunityType: recognizedOpportunity.type,
      opportunityStage: recognizedOpportunity.stage,
      opportunityQuality: recognizedOpportunity.quality,
      opportunityLaneRecommendation: recognizedOpportunity.laneRecommendation,
      selfImprovementHypothesisStatus: selfImprovementHypothesis?.status,
      selfImprovementHypothesisReason: selfImprovementNote,
      cmdIndependentDateGateStatus,
      cmdIndependentDateGateReason,
      fvgTargetStatus,
      targetConstructionStatus,
      invalidationConstructionStatus,
      rrConstructionStatus,
      smtStatus,
      riskStatus,
      hydrationSource: packet.compactSummary.hydrationSource,
      hydrationWarning: packet.compactSummary.hydrationWarning,
      displayTimeframe,
      analysisTimeframesRequested,
      analysisTimeframesLoaded,
      requiredTimeframesLoaded,
      analysisTimeframesUsed,
      analysisDepthStatus,
      multiTimeframeContextStatus,
      missingTimeframes,
      htfBiasSource,
      sessionModelSourceTimeframe,
      confirmationSourceTimeframe,
      weeklyBiasStatus,
      weeklyBiasDirection,
      weeklyBiasReason,
      htfAlignment
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
