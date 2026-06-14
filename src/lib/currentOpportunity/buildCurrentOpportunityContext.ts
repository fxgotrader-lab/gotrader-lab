import type { IctAdvisorPacket } from "../ict-strategy-suite/ictAdvisorTypes";
import type { IctCurrentRead } from "../ict-strategy-suite/ictCurrentReadTypes";
import type { CurrentOpportunityContext, CurrentOpportunitySourceDepth } from "./currentOpportunityTypes";

const normalizeList = (values?: Array<string | undefined>) =>
  Array.from(new Set((values ?? []).filter((value): value is string => Boolean(value?.trim()))));

const clampDays = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Number(value.toFixed(2))) : 0;

const depthPolicyFor = (depth: Pick<CurrentOpportunitySourceDepth, "tacticalLatestCandleCount" | "swingContextDays" | "validationLookbackDays" | "rangeHistoryAvailable">): CurrentOpportunitySourceDepth["depthPolicyStatus"] => {
  if (depth.rangeHistoryAvailable && depth.validationLookbackDays >= 60) return "validation_context_ready";
  if (depth.swingContextDays >= 5) return "swing_context_ready";
  if (depth.tacticalLatestCandleCount >= 400) return "tactical_only";
  return "insufficient";
};

export const buildCurrentOpportunitySourceDepth = ({
  currentRead,
  packet
}: {
  currentRead?: Partial<IctCurrentRead>;
  packet?: Partial<IctAdvisorPacket>;
}): CurrentOpportunitySourceDepth => {
  const tacticalLatestCandleCount =
    currentRead?.candleCount ??
    packet?.activeSource?.candleCount ??
    0;
  const analysisDepthStatus =
    currentRead?.analysisDepthStatus ??
    currentRead?.dataDepthStatus ??
    packet?.marketAnalysisContext?.analysisDepthStatus ??
    packet?.compactSummary?.analysisDepthStatus ??
    packet?.compactSummary?.dataDepthStatus;
  const validationLookbackDays = clampDays(
    currentRead?.availableLookbackDays ??
    packet?.compactSummary?.availableLookbackDays ??
    packet?.sessionNarrative?.dataDepth.availableLookbackDays ??
    packet?.marketAnalysisContext?.analysisTimeframes?.reduce((max, timeframe) => Math.max(max, timeframe.availableLookbackDays ?? 0), 0)
  );
  const rangeHistoryCandleCount = packet?.marketAnalysisContext?.analysisTimeframes?.reduce((sum, timeframe) => sum + (timeframe.candleCount ?? 0), 0);
  const rangeHistoryAvailable =
    analysisDepthStatus === "sufficient" ||
    validationLookbackDays >= 5 ||
    (rangeHistoryCandleCount ?? 0) > 5000;
  const sessionContextAvailable = Boolean(
    currentRead?.sessionNarrativeProfile ||
    currentRead?.sessionModelSourceTimeframe ||
    packet?.sessionNarrative
  );
  const swingContextDays = Math.min(validationLookbackDays, rangeHistoryAvailable ? 10 : tacticalLatestCandleCount >= 1000 ? 3 : 0);
  const base = {
    tacticalLatestCandleCount,
    sessionContextAvailable,
    swingContextDays,
    validationLookbackDays,
    validationContextAvailable: validationLookbackDays >= 60,
    rangeHistoryAvailable,
    rangeHistoryCandleCount,
    analysisDepthStatus,
    depthPolicyStatus: "insufficient" as CurrentOpportunitySourceDepth["depthPolicyStatus"],
    depthWarnings: [] as string[]
  };
  const depthPolicyStatus = depthPolicyFor(base);
  const depthWarnings = normalizeList([
    tacticalLatestCandleCount < 400 ? "Tactical candle window is below research minimum." : undefined,
    !sessionContextAvailable ? "Session context is missing or still lightweight." : undefined,
    !rangeHistoryAvailable ? "Only the latest tactical candle window is available; explicit 90-day Activate Market context is required." : undefined,
    validationLookbackDays > 0 && validationLookbackDays < 60 ? `Validation lookback is ${validationLookbackDays} days; 90-day context is preferred.` : undefined,
    analysisDepthStatus && analysisDepthStatus !== "sufficient" ? `Analysis depth is ${analysisDepthStatus}.` : undefined
  ]);
  return {
    ...base,
    depthPolicyStatus,
    depthWarnings
  };
};

export const buildCurrentOpportunityContext = ({
  currentRead,
  packet
}: {
  currentRead?: Partial<IctCurrentRead>;
  packet?: Partial<IctAdvisorPacket>;
}): CurrentOpportunityContext => {
  const sourceDepth = buildCurrentOpportunitySourceDepth({ currentRead, packet });
  const sourceProvider =
    currentRead?.packetSource === "live_mt5"
      ? "mt5_read_only"
      : packet?.activeSource?.provider ?? currentRead?.packetSource ?? "unavailable";
  const generatedAt = packet?.generatedAt ?? currentRead?.debug?.lastEvaluationAt ?? new Date().toISOString();
  const requestedSymbol = currentRead?.requestedSymbol ?? packet?.requestedSymbol ?? "MNQ";
  const brokerSymbol = currentRead?.brokerSymbol ?? packet?.brokerSymbol ?? requestedSymbol;
  const primaryTimeframe = currentRead?.primaryTimeframe ?? packet?.primaryTimeframe ?? "5m";
  const sourceStatus = packet?.activeSource?.sourceStatus;
  const contextTimeframes = normalizeList([
    ...((currentRead?.analysisTimeframesUsed ?? packet?.marketAnalysisContext?.analysisTimeframesUsed ?? packet?.compactSummary?.analysisTimeframesUsed ?? []) as string[]),
    ...(currentRead?.htfTimeframes ?? packet?.htfTimeframes ?? [])
  ]);
  return {
    generatedAt,
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe,
    contextTimeframes,
    sourceProvider,
    sourceFingerprint: currentRead?.debug?.sourceFingerprint ?? packet?.activeSource?.sourceFingerprint,
    sourceLabel: packet?.activeSource?.sourceLabel,
    isMockOrSample: sourceStatus?.isMockOrSample ?? sourceProvider === "mock",
    isResearchActive: sourceStatus?.isResearchActive ?? sourceProvider === "mt5_read_only",
    isProxyInstrument: sourceStatus?.isProxyInstrument ?? brokerSymbol !== requestedSymbol,
    modelName: currentRead?.modelName ?? packet?.compactSummary?.primaryModelDetection?.modelName,
    modelState: currentRead?.modelState ?? packet?.compactSummary?.primaryModelDetection?.modelState,
    modelLane: currentRead?.modelQualityLane ?? packet?.approvedProfileDecision?.status,
    opportunityType: currentRead?.opportunityType,
    opportunityStage: currentRead?.opportunityStage,
    opportunityQuality: currentRead?.opportunityQuality,
    opportunityDirection: currentRead?.opportunityDirection,
    opportunityNextAction: currentRead?.opportunityNextAction,
    opportunityBlockers: currentRead?.opportunityBlockers ?? [],
    opportunityMissingEvidence: currentRead?.opportunityMissingEvidence ?? [],
    topReasons: currentRead?.topReasons ?? packet?.recommendedSignal?.noTradeReasons ?? [],
    side: currentRead?.side,
    setupName: currentRead?.bestSetup ?? packet?.recommendedSignal?.setup,
    thesis: currentRead?.opportunitySummary ?? packet?.recommendedSignal?.summary,
    entry: packet?.recommendedSignal?.entryZone?.midpoint,
    invalidation: currentRead?.invalidation ?? packet?.recommendedSignal?.invalidation,
    target: currentRead?.target ?? packet?.recommendedSignal?.target,
    rrEstimate: currentRead?.rrEstimate ?? packet?.recommendedSignal?.rrEstimate,
    confidence: currentRead?.confidence ?? packet?.recommendedSignal?.confidence,
    htfAlignmentStatus: currentRead?.htfAlignment?.alignmentStatus ?? packet?.compactSummary?.htfAlignment?.alignmentStatus,
    htfConflictReason: currentRead?.htfAlignment?.conflictReason ?? packet?.compactSummary?.htfAlignment?.conflictReason,
    weeklyBiasDirection: currentRead?.weeklyBiasDirection ?? packet?.compactSummary?.weeklyBiasDirection,
    sessionNarrativeProfile: currentRead?.sessionNarrativeProfile ?? packet?.compactSummary?.sessionNarrativeProfile,
    sessionDirectionalRead: currentRead?.sessionDirectionalRead ?? packet?.compactSummary?.sessionDirectionalRead,
    fvgStatus: currentRead?.fvgStatus,
    displacementStatus: currentRead?.displacementStatus,
    drawOnLiquidity: currentRead?.drawOnLiquidity ?? packet?.compactSummary?.drawOnLiquidity,
    liquiditySwept: currentRead?.liquiditySwept,
    currentOpportunityDetected: currentRead?.opportunityDetected,
    paperWatchlistEligible: currentRead?.paperWatchlistEligible,
    cmdIndependentDateGateStatus: currentRead?.cmdIndependentDateGateStatus,
    cmdIndependentDateGateReason: currentRead?.cmdIndependentDateGateReason,
    analysisTimeframesUsed: currentRead?.analysisTimeframesUsed ?? packet?.marketAnalysisContext?.analysisTimeframesUsed ?? [],
    missingTimeframes: currentRead?.missingTimeframes ?? packet?.marketAnalysisContext?.missingTimeframes ?? [],
    sourceDepth
  };
};
