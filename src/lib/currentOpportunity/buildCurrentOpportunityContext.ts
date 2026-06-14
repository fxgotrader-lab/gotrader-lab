import type { IctAdvisorPacket } from "../ict-strategy-suite/ictAdvisorTypes";
import type { IctCurrentRead } from "../ict-strategy-suite/ictCurrentReadTypes";
import type {
  CurrentOpportunityContext,
  CurrentOpportunitySourceDepth,
  CurrentOpportunityTimeframeRole,
  CurrentOpportunityTopDownBiasStatus
} from "./currentOpportunityTypes";

const normalizeList = (values?: Array<string | undefined>) =>
  Array.from(new Set((values ?? []).filter((value): value is string => Boolean(value?.trim()))));

const clampDays = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Number(value.toFixed(2))) : 0;

const parseEntryMidpoint = (entryZone?: string) => {
  if (!entryZone) return undefined;
  const numbers = entryZone.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (numbers.length >= 2) return Number(((Math.min(numbers[0], numbers[1]) + Math.max(numbers[0], numbers[1])) / 2).toFixed(4));
  return numbers[0];
};

const depthPolicyFor = (depth: Pick<CurrentOpportunitySourceDepth, "tacticalLatestCandleCount" | "swingContextDays" | "validationLookbackDays" | "rangeHistoryAvailable">): CurrentOpportunitySourceDepth["depthPolicyStatus"] => {
  if (depth.rangeHistoryAvailable && depth.validationLookbackDays >= 60) return "validation_context_ready";
  if (depth.swingContextDays >= 5) return "swing_context_ready";
  if (depth.tacticalLatestCandleCount >= 400) return "tactical_only";
  return "insufficient";
};

const timeframeRoles: Record<string, string> = {
  W1: "weekly bias",
  D1: "daily bias",
  H4: "HTF bias",
  H1: "dealing range",
  M15: "session model",
  M5: "confirmation/refinement",
  M1: "entry refinement"
};

export const buildCurrentOpportunityTimeframeRoleSummary = ({
  loaded,
  missing
}: {
  loaded?: string[];
  missing?: string[];
}): CurrentOpportunityTimeframeRole[] => {
  const loadedSet = new Set(normalizeList(loaded));
  const missingSet = new Set(normalizeList(missing));
  return Object.entries(timeframeRoles)
    .filter(([timeframe]) => loadedSet.has(timeframe) || missingSet.has(timeframe))
    .map(([timeframe, role]) => ({
      timeframe,
      role,
      status: loadedSet.has(timeframe) ? "loaded" as const : "missing" as const
    }));
};

export const classifyCurrentOpportunityTopDownBias = ({
  htfAlignmentStatus,
  missingTimeframes,
  weeklyBiasDirection,
  timeframeRoleSummary
}: {
  htfAlignmentStatus?: string;
  missingTimeframes?: string[];
  weeklyBiasDirection?: string;
  timeframeRoleSummary?: CurrentOpportunityTimeframeRole[];
}): CurrentOpportunityTopDownBiasStatus => {
  const roles = timeframeRoleSummary ?? [];
  if (!roles.length) return "unavailable";
  const requiredMissing = new Set(missingTimeframes ?? []);
  if (requiredMissing.has("M5") || requiredMissing.has("M15")) return "insufficient_data";
  if (!weeklyBiasDirection || weeklyBiasDirection === "unavailable" || weeklyBiasDirection === "missing") {
    return requiredMissing.size ? "insufficient_data" : "mixed";
  }
  const normalized = htfAlignmentStatus?.toLowerCase() ?? "";
  if (/aligned/.test(normalized) && !/partial|mixed|conflict/.test(normalized)) return "aligned";
  if (/conflict/.test(normalized)) return "conflicted";
  if (/mixed|partial/.test(normalized)) return "mixed";
  return requiredMissing.size ? "insufficient_data" : "mixed";
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
  const missingTimeframes = currentRead?.missingTimeframes ?? packet?.marketAnalysisContext?.missingTimeframes ?? [];
  const htfAlignmentStatus = currentRead?.htfAlignment?.alignmentStatus ?? packet?.compactSummary?.htfAlignment?.alignmentStatus;
  const weeklyBiasDirection = currentRead?.weeklyBiasDirection ?? packet?.compactSummary?.weeklyBiasDirection;
  const timeframeRoleSummary = buildCurrentOpportunityTimeframeRoleSummary({
    loaded: contextTimeframes,
    missing: missingTimeframes
  });
  const topDownBiasStatus = classifyCurrentOpportunityTopDownBias({
    htfAlignmentStatus,
    missingTimeframes,
    weeklyBiasDirection,
    timeframeRoleSummary
  });
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
    entry: packet?.recommendedSignal?.entryZone?.midpoint ?? parseEntryMidpoint(currentRead?.entryZone),
    invalidation: currentRead?.invalidation ?? packet?.recommendedSignal?.invalidation,
    target: currentRead?.target ?? packet?.recommendedSignal?.target,
    rrEstimate: currentRead?.rrEstimate ?? packet?.recommendedSignal?.rrEstimate,
    confidence: currentRead?.confidence ?? packet?.recommendedSignal?.confidence,
    htfAlignmentStatus,
    htfConflictReason: currentRead?.htfAlignment?.conflictReason ?? packet?.compactSummary?.htfAlignment?.conflictReason,
    topDownBiasStatus,
    timeframeRoleSummary,
    weeklyBiasDirection,
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
    missingTimeframes,
    sourceDepth
  };
};
