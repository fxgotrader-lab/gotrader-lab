import type { ResolvedWalkForwardCandleSource } from "@/lib/walkForward/walkForwardSourceResolver";
import type {
  WalkForwardPreflightBlocker,
  WalkForwardPreflightSummary,
  WalkForwardSourceDepthStatus,
  WalkForwardSourceDepthUsed,
  WalkForwardWindowDefinition
} from "@/lib/walkForward/walkForwardTypes";

export interface WalkForwardPreflightValidationChainInput {
  recognitionId?: string;
  setupLabel?: string;
  symbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  sourceFingerprint?: string;
  hypothesisStatus?: string;
  replayResult?: {
    verdict?: string;
    totalSignals?: number;
    reason?: string;
  };
}

export interface BuildWalkForwardPreflightInput {
  source: Pick<
    ResolvedWalkForwardCandleSource,
    | "brokerSymbol"
    | "candles"
    | "dataQuality"
    | "mode"
    | "provider"
    | "sourceFingerprint"
    | "walkForwardEligible"
    | "walkForwardEligibilityReasons"
  > & {
    appliedSettings?: { targetTimeframe?: string };
    label?: string;
    metadata?: { symbol?: string };
    processedCandleCount?: number;
    rawCandleCount?: number;
    researchWindowCandles?: number;
    sourceWarnings?: string[];
  };
  windows: Pick<WalkForwardWindowDefinition, "splits">[];
  validationChainEntry?: WalkForwardPreflightValidationChainInput;
  requireReplayHandoff?: boolean;
  minimumCandidates?: number;
  minimumReplayPassedCandidates?: number;
  minimumUniqueTradingDates?: number;
  minimumWindows?: number;
  minimumOosTrades?: number;
}

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

const daysBetween = (first?: string, last?: string) => {
  if (!first || !last) return 0;
  const span = Date.parse(last) - Date.parse(first);
  return Number.isFinite(span) ? Number((Math.max(0, span) / 86400000).toFixed(2)) : 0;
};

const uniqueTradingDatesFor = (candles: Array<{ timestamp?: string }>) =>
  new Set(
    candles
      .map((candle) => candle.timestamp?.slice(0, 10))
      .filter((value): value is string => Boolean(value))
  ).size;

const sourceDepthUsedFor = (
  source: BuildWalkForwardPreflightInput["source"],
  availableLookbackDays: number
): WalkForwardSourceDepthUsed => {
  if (!source.walkForwardEligible || !source.candles.length) return "unavailable";
  if (source.provider === "mt5_read_only" && availableLookbackDays >= 80) return "mt5_90_day_range";
  if (source.provider === "mt5_read_only" && (source.rawCandleCount ?? source.candles.length) <= 1000) return "tactical_latest_window";
  return "active_walk_forward_source";
};

const sourceDepthStatusFor = (
  source: BuildWalkForwardPreflightInput["source"],
  availableLookbackDays: number
): WalkForwardSourceDepthStatus => {
  if (!source.walkForwardEligible || !source.candles.length) return "unavailable";
  if (availableLookbackDays >= 80) return "sufficient";
  if (availableLookbackDays >= 20) return "limited";
  if (source.provider === "mt5_read_only" && (source.rawCandleCount ?? source.candles.length) <= 1000) return "tactical_only";
  return "insufficient";
};

const sourceDepthLabelFor = (
  depthUsed: WalkForwardSourceDepthUsed,
  availableLookbackDays: number,
  source: BuildWalkForwardPreflightInput["source"]
) => {
  if (depthUsed === "mt5_90_day_range") {
    return `MT5 explicit range history (${availableLookbackDays.toFixed(1)} days).`;
  }
  if (depthUsed === "tactical_latest_window") {
    return `MT5 latest chart window only (${source.candles.length.toLocaleString()} candles).`;
  }
  if (depthUsed === "active_walk_forward_source") {
    return `${source.provider.replace(/_/g, " ")} active window (${availableLookbackDays.toFixed(1)} days).`;
  }
  return "No eligible walk-forward source.";
};

const blocker = (
  code: WalkForwardPreflightBlocker["code"],
  message: string,
  currentValue: string | number | undefined,
  requiredValue: string | number | undefined,
  nextAction: string
): WalkForwardPreflightBlocker => ({
  code,
  message,
  currentValue,
  requiredValue,
  nextAction
});

export function buildWalkForwardPreflight({
  minimumCandidates = 20,
  minimumOosTrades = 20,
  minimumReplayPassedCandidates = 20,
  minimumUniqueTradingDates = 3,
  minimumWindows = 3,
  requireReplayHandoff = true,
  source,
  validationChainEntry,
  windows
}: BuildWalkForwardPreflightInput): WalkForwardPreflightSummary {
  const sortedCandles = [...source.candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const first = sortedCandles[0]?.timestamp;
  const last = sortedCandles[sortedCandles.length - 1]?.timestamp;
  const availableLookbackDays = daysBetween(first, last);
  const uniqueTradingDates = uniqueTradingDatesFor(sortedCandles);
  const sourceDepthUsed = sourceDepthUsedFor(source, availableLookbackDays);
  const sourceDepthStatus = sourceDepthStatusFor(source, availableLookbackDays);
  const canRequestDeepMt5History = source.provider === "mt5_read_only" && source.walkForwardEligible && sourceDepthUsed !== "mt5_90_day_range";
  const replay = validationChainEntry?.replayResult;
  const availableCandidateCount = Number(replay?.totalSignals ?? 0);
  const replayPassedCandidateCount = replay?.verdict === "passed" ? availableCandidateCount : 0;
  const estimatedOosTrades = Math.min(availableCandidateCount, windows.length * Math.max(1, Math.ceil(minimumOosTrades / Math.max(1, minimumWindows))));
  const blockers: WalkForwardPreflightBlocker[] = [];
  const warnings: string[] = [];

  if (!source.walkForwardEligible) {
    blockers.push(
      blocker(
        "source_not_eligible",
        source.walkForwardEligibilityReasons?.[0] ?? "Active walk-forward source is not eligible.",
        source.provider,
        "eligible MT5 read-only or imported source",
        "Activate MT5 Research Mode or select an eligible historical source before walk-forward."
      )
    );
  }

  if (requireReplayHandoff) {
    if (!validationChainEntry?.setupLabel) {
      blockers.push(
        blocker(
          "missing_strategy_id",
          "Walk-forward input has no strategy/model from the replay validation chain.",
          "missing",
          "strategy/model id",
          "Run replay from Advisor/ICT Lab so the validation chain carries the model family into walk-forward."
        )
      );
    }
    if (!validationChainEntry?.sourceFingerprint) {
      blockers.push(
        blocker(
          "missing_source_fingerprint",
          "Walk-forward input has no source fingerprint from replay.",
          "missing",
          "source fingerprint",
          "Run replay against the active MT5 canonical source before walk-forward."
        )
      );
    }
    if (!replay) {
      blockers.push(
        blocker(
          "missing_replay_result",
          "No compact replay result is attached to the current validation chain.",
          "missing",
          "replay passed",
          "Run replay validation first; walk-forward should only run after replay creates preliminary evidence."
        )
      );
    } else if (replay.verdict !== "passed") {
      blockers.push(
        blocker(
          "replay_not_passed",
          `Replay has not passed: ${replay.reason ?? replay.verdict ?? "unknown replay state"}.`,
          replay.verdict ?? "unknown",
          "passed",
          "Fix or discard the replay hypothesis before walk-forward."
        )
      );
    }
  }

  if (replay && availableCandidateCount < minimumCandidates) {
    blockers.push(
      blocker(
        "insufficient_replay_candidates",
        `Replay has only ${availableCandidateCount} candidate(s); ${minimumCandidates} are required before walk-forward can judge strategy quality.`,
        availableCandidateCount,
        minimumCandidates,
        "Collect more replay candidates or narrow the strategy only after more MT5 history confirms the setup."
      )
    );
  }

  if (replay && replayPassedCandidateCount < minimumReplayPassedCandidates) {
    blockers.push(
      blocker(
        "insufficient_replay_candidates",
        `Replay-passed candidate count is ${replayPassedCandidateCount}/${minimumReplayPassedCandidates}.`,
        replayPassedCandidateCount,
        minimumReplayPassedCandidates,
        "Run or extend replay until enough preliminary outcomes exist."
      )
    );
  }

  if (sourceDepthStatus !== "sufficient") {
    const isDeepHistoryPreview = sourceDepthStatus === "tactical_only" && canRequestDeepMt5History;
    if (isDeepHistoryPreview) {
      warnings.push("Active preview is the latest MT5 chart window. The explicit run action will request 90-day MT5 range history before processing.");
    } else {
      blockers.push(
        blocker(
          "source_depth_insufficient",
          `Walk-forward source depth is ${sourceDepthStatus.replace(/_/g, " ")} (${availableLookbackDays.toFixed(1)} days).`,
          `${availableLookbackDays.toFixed(1)} days`,
          "80+ days or explicit imported validation history",
          "Use explicit 90-day MT5 range history or an imported historical dataset before walk-forward."
        )
      );
    }
  }

  if (uniqueTradingDates < minimumUniqueTradingDates && !canRequestDeepMt5History) {
    blockers.push(
      blocker(
        "insufficient_unique_dates",
        `Only ${uniqueTradingDates} unique trading date(s) are available in the walk-forward source.`,
        uniqueTradingDates,
        minimumUniqueTradingDates,
        "Use deeper MT5 range history or imported history so OOS windows are independent."
      )
    );
  }

  if (windows.length < minimumWindows) {
    blockers.push(
      blocker(
        "insufficient_windows",
        `Only ${windows.length} rolling walk-forward window(s) can be generated.`,
        windows.length,
        minimumWindows,
        "Use Standard/Advanced walk-forward settings or deeper history before running."
      )
    );
  }

  const status = blockers.length ? "blocked" : "ready";
  const nextAction = blockers[0]?.nextAction ??
    (warnings[0] ?? "Run walk-forward with compact progress. No execution or readiness promotion is possible.");

  return {
    status,
    strategyId: validationChainEntry?.setupLabel,
    validationChainId: validationChainEntry?.recognitionId,
    requestedSymbol: validationChainEntry?.symbol ?? source.metadata?.symbol ?? source.candles[0]?.symbol,
    brokerSymbol: validationChainEntry?.brokerSymbol ?? source.brokerSymbol,
    timeframe: validationChainEntry?.timeframe ?? source.appliedSettings?.targetTimeframe ?? source.candles[0]?.timeframe,
    sourceProvider: source.provider,
    sourceFingerprint: source.sourceFingerprint,
    sourceDepthUsed,
    sourceDepthStatus,
    sourceDepthLabel: sourceDepthLabelFor(sourceDepthUsed, availableLookbackDays, source),
    canRequestDeepMt5History,
    availableLookbackDays,
    availableCandidateCount,
    replayPassedCandidateCount,
    uniqueTradingDates,
    activeRollingWindowsPossible: windows.length,
    estimatedOosTrades,
    requiredCandidates: minimumCandidates,
    requiredReplayPassedCandidates: minimumReplayPassedCandidates,
    requiredUniqueTradingDates: minimumUniqueTradingDates,
    requiredWindows: minimumWindows,
    requiredOosTrades: minimumOosTrades,
    blockers,
    warnings,
    nextAction,
    authority,
    safety
  };
}
