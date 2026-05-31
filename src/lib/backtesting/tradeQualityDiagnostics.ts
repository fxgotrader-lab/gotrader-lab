import type {
  BacktestConfig,
  BacktestResult,
  BacktestSessionFilter,
  BacktestStopModel
} from "@/lib/backtesting/backtestTypes";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { ValidationSuiteReport } from "@/lib/validation";

export type TradeQualityReasonCode =
  | "win_rate_too_low"
  | "average_r_too_low"
  | "max_drawdown_too_high"
  | "sample_size_too_low"
  | "session_filter_weak"
  | "long_short_bias_weak"
  | "stop_model_weak"
  | "target_r_mismatch"
  | "too_many_low_r_trades"
  | "false_positive_cluster"
  | "grinch_timing_expired_trades"
  | "grinch_weak_profile_trades"
  | "grinch_entry_confirmation_conflict"
  | "grinch_missing_intermarket_confirmation"
  | "grinch_score_conflict"
  | "grinch_profile_fallback_search"
  | "grinch_no_valid_profile_no_trade"
  | "conservative_scenario_unstable";

export type TradeQualityDiagnosticSeverity = "info" | "warning" | "blocking";

export interface TradeQualityCandidateHint {
  label: string;
  patch: BacktestConfig;
  reason: string;
}

export interface TradeQualityDiagnostic {
  reasonCode: TradeQualityReasonCode;
  currentValue: string;
  requiredValue: string;
  severity: TradeQualityDiagnosticSeverity;
  explanation: string;
  suggestedFix: string;
  candidateConfigHints: TradeQualityCandidateHint[];
}

export interface TradeQualityDiagnosticInput {
  result: BacktestResult;
  validation?: ValidationSuiteReport;
  quality?: ResearchQualityReview;
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const r = (value: number) => `${value.toFixed(2)}R`;

const diagnostic = (
  reasonCode: TradeQualityReasonCode,
  currentValue: string,
  requiredValue: string,
  severity: TradeQualityDiagnosticSeverity,
  explanation: string,
  suggestedFix: string,
  candidateConfigHints: TradeQualityCandidateHint[]
): TradeQualityDiagnostic => ({
  reasonCode,
  currentValue,
  requiredValue,
  severity,
  explanation,
  suggestedFix,
  candidateConfigHints
});

const hint = (label: string, patch: BacktestConfig, reason: string): TradeQualityCandidateHint => ({
  label,
  patch,
  reason
});

const stopModelHints = (currentStopModel: BacktestStopModel): TradeQualityCandidateHint[] =>
  [
    hint("Fixed tick stop test", { stopModel: "fixed ticks", fixedTickStopSize: 40 }, "Check whether bounded fixed risk improves win rate."),
    hint("Latest swing stop test", { stopModel: "latest swing" }, "Check whether structure-based invalidation reduces weak stop-outs."),
    hint("FVG invalidation test", { stopModel: "FVG invalidation" }, "Check whether fair-value-gap invalidation better matches ICT setups.")
  ].filter((item) => item.patch.stopModel !== currentStopModel);

const sessionCounts = (result: BacktestResult) => {
  const counts = new Map<string, { trades: number; wins: number; averageR: number }>();
  for (const trade of result.trades) {
    const entry = counts.get(trade.session) ?? { trades: 0, wins: 0, averageR: 0 };
    entry.trades += 1;
    entry.wins += trade.rMultiple > 0 ? 1 : 0;
    entry.averageR += trade.rMultiple;
    counts.set(trade.session, entry);
  }
  return [...counts.entries()].map(([session, value]) => ({
    session,
    trades: value.trades,
    winRate: value.trades ? value.wins / value.trades : 0,
    averageR: value.trades ? value.averageR / value.trades : 0
  }));
};

const biasCounts = (result: BacktestResult) => {
  const counts = new Map<string, { trades: number; wins: number; averageR: number }>();
  for (const trade of result.trades) {
    const entry = counts.get(trade.bias) ?? { trades: 0, wins: 0, averageR: 0 };
    entry.trades += 1;
    entry.wins += trade.rMultiple > 0 ? 1 : 0;
    entry.averageR += trade.rMultiple;
    counts.set(trade.bias, entry);
  }
  return [...counts.entries()].map(([bias, value]) => ({
    bias,
    trades: value.trades,
    winRate: value.trades ? value.wins / value.trades : 0,
    averageR: value.trades ? value.averageR / value.trades : 0
  }));
};

export const topTradeQualityDiagnostic = (diagnostics: TradeQualityDiagnostic[]) =>
  diagnostics.find((item) => item.severity === "blocking") ??
  diagnostics.find((item) => item.severity === "warning") ??
  diagnostics[0];

export function diagnoseTradeQuality({
  result,
  validation,
  quality
}: TradeQualityDiagnosticInput): TradeQualityDiagnostic[] {
  const diagnostics: TradeQualityDiagnostic[] = [];
  const { summary, config } = result;
  const totalTrades = summary.totalTrades;
  const lowRTrades = result.trades.filter((trade) => trade.rMultiple <= 0.25).length;
  const lowRRatio = totalTrades ? lowRTrades / totalTrades : 0;
  const stopHits = result.trades.filter((trade) => trade.stopHit).length;
  const stopHitRate = totalTrades ? stopHits / totalTrades : 0;
  const losingTrades = result.trades.filter((trade) => trade.rMultiple < 0);
  const falsePositiveProxy = losingTrades.filter((trade) => trade.maxFavorableExcursion < 0.5).length;
  const falsePositiveRatio = totalTrades ? falsePositiveProxy / totalTrades : 0;
  const sessions = sessionCounts(result);
  const biases = biasCounts(result);
  const bestSession = [...sessions].sort((a, b) => b.averageR - a.averageR)[0];
  const worstSession = [...sessions].sort((a, b) => a.averageR - b.averageR)[0];
  const bestBias = [...biases].sort((a, b) => b.averageR - a.averageR)[0];
  const worstBias = [...biases].sort((a, b) => a.averageR - b.averageR)[0];
  const conservativeStable = validation
    ? validation.calibration.readinessScore >= 55 ||
      validation.calibration.readinessStatus === "yellow" ||
      validation.calibration.readinessStatus === "green"
    : quality?.readinessGrade === "Paper-Demo Candidate" || quality?.readinessGrade === "Research Ready";
  const grinchBlockers = summary.grinchSummary?.falsePositiveBlockerCounts ?? {};
  const grinchHardBlockedSignals = summary.grinchSummary?.hardBlockedSignals ?? 0;
  const timingExpiredCount = grinchBlockers.timing_expired_trade ?? 0;
  const weakProfileCount = grinchBlockers.weak_profile_trade ?? 0;
  const entryProfileConflictCount = grinchBlockers.entry_confirmation_without_valid_profile ?? 0;
  const missingIntermarketCount = grinchBlockers.missing_intermarket_confirmation ?? 0;
  const grinchScoreConflictCount = grinchBlockers.grinch_score_conflict ?? 0;
  const reversalCandidates = summary.grinchSummary?.profileCandidateCounts.reversal ?? 0;
  const consolidationCandidates = summary.grinchSummary?.profileCandidateCounts.consolidation ?? 0;
  const noValidProfileSignals = summary.grinchSummary?.noValidProfileSignals ?? 0;

  if (totalTrades < 30) {
    diagnostics.push(
      diagnostic(
        "sample_size_too_low",
        `${totalTrades} trades`,
        "30+ trades preferred before promotion",
        totalTrades < 10 ? "blocking" : "warning",
        "The strategy has too little simulated evidence to trust win rate, average R, or drawdown conclusions.",
        "Keep the safest filters, but run a larger safe historical window or a bounded threshold/session test before approving calibration.",
        [
          hint("All sessions sample test", { sessionFilter: "all" }, "Check whether sample size improves without collapsing quality."),
          hint("Balanced threshold sample test", {
            minimumConfluenceThreshold: Math.max(0.35, config.minimumConfluenceThreshold - 0.03),
            minimumConfidenceThreshold: Math.max(0.35, config.minimumConfidenceThreshold - 0.02)
          }, "Slightly widen filters only for research sampling.")
        ]
      )
    );
  }

  if (summary.winRate < 0.35) {
    diagnostics.push(
      diagnostic(
        "win_rate_too_low",
        pct(summary.winRate),
        "35%+ minimum research quality",
        summary.winRate < 0.25 ? "blocking" : "warning",
        "Too many simulated trades are failing before the target, so the thesis/filter combination is not selective enough.",
        "Test session and direction filters first, then test stop model changes before lowering thresholds further.",
        [
          hint("NY AM only", { sessionFilter: "NY AM Kill Zone" }, "Isolate a cleaner futures session."),
          hint("London only", { sessionFilter: "London" }, "Compare London behavior separately."),
          hint("Higher confidence filter", { minimumConfidenceThreshold: Math.min(0.85, config.minimumConfidenceThreshold + 0.07) }, "Require stronger CIO conviction.")
        ]
      )
    );
  }

  if (timingExpiredCount > 0) {
    diagnostics.push(
      diagnostic(
        "grinch_timing_expired_trades",
        `${timingExpiredCount} expired-timing decision(s); ${grinchHardBlockedSignals} hard blocked`,
        "0 expired Grinch timing trades",
        "blocking",
        "Grinch timing expired before the setup could be treated as a valid Model 1, reversal, or consolidation entry.",
        "Block expired Grinch timing and rerun Standard imported data before evaluating win rate.",
        [
          hint("Block expired Grinch timing", { minimumConfidenceThreshold: Math.min(0.9, config.minimumConfidenceThreshold + 0.06) }, "Require stronger evidence while expired-timing hard gates remove no-trade profiles."),
          hint("NY AM timing-only check", { sessionFilter: "NY AM Kill Zone" }, "Retest only the intended NY timing window.")
        ]
      )
    );
  }

  if (reversalCandidates > 0 || consolidationCandidates > 0) {
    diagnostics.push(
      diagnostic(
        "grinch_profile_fallback_search",
        `${reversalCandidates} reversal candidate(s), ${consolidationCandidates} consolidation candidate(s)`,
        "Fallback profile candidates should be tested before forcing Model 1",
        "info",
        "Model 1 was not the only profile considered; valid Reversal and Consolidation opportunities are counted separately for follow-up search.",
        "Prefer profile-specific Grinch candidates over forcing weak or expired Model 1 exposure.",
        [
          hint("Reversal profile only", { sessionFilter: "NY AM Kill Zone" }, "Search for valid failed London/12AM interaction and NY reversal timing."),
          hint("Consolidation profile only", { sessionFilter: "NY AM Kill Zone" }, "Search for 12AM consolidation, raid, and expansion profiles.")
        ]
      )
    );
  }

  if (noValidProfileSignals > 0 && summary.totalTrades <= 1) {
    diagnostics.push(
      diagnostic(
        "grinch_no_valid_profile_no_trade",
        `${noValidProfileSignals} no-valid-profile decision(s)`,
        "No-trade is correct when Model 1, Reversal, and Consolidation are invalid or mistimed",
        "info",
        "The Grinch layer did not find a valid timing/profile combination, so suppressed exposure is a correct research outcome rather than a strategy failure by itself.",
        "Use a timing-window or profile-specific search instead of widening generic thresholds.",
        [
          hint("Timing-valid only", { sessionFilter: "NY AM Kill Zone" }, "Retest the intended NY timing window without letting expired profiles through."),
          hint("No trade when no valid profile", { minimumConfidenceThreshold: Math.min(0.9, config.minimumConfidenceThreshold + 0.05) }, "Keep no-profile windows flat.")
        ]
      )
    );
  }

  if (weakProfileCount > 0) {
    diagnostics.push(
      diagnostic(
        "grinch_weak_profile_trades",
        `${weakProfileCount} weak-profile decision(s)`,
        "Weak profile requires valid timing plus PD respect/displacement",
        "blocking",
        "A weak Grinch profile should not raise confidence by itself; it needs stronger PD array respect, displacement, and valid timing.",
        "Require profile plus entry confirmation instead of allowing opening-price or PD alignment alone.",
        [
          hint("Require valid profile plus entry", {
            minimumConfluenceThreshold: Math.min(0.85, config.minimumConfluenceThreshold + 0.08),
            minimumConfidenceThreshold: Math.min(0.9, config.minimumConfidenceThreshold + 0.06)
          }, "Keep only stronger profile-confirmation combinations.")
        ]
      )
    );
  }

  if (entryProfileConflictCount > 0 || grinchScoreConflictCount > 0) {
    diagnostics.push(
      diagnostic(
        "grinch_entry_confirmation_conflict",
        `${entryProfileConflictCount} entry/profile conflict(s); ${grinchScoreConflictCount} score conflict(s)`,
        "Entry confirmation must not override weak/expired profile state",
        "blocking",
        "High entry-confirmation components were present while the Grinch profile or timing gate said no-trade.",
        "Cap Grinch score and block trades whenever timing/profile validity conflicts with entry confirmation.",
        [
          hint("Profile plus entry confirmation", {
            minimumConfluenceThreshold: Math.min(0.85, config.minimumConfluenceThreshold + 0.08),
            minimumConfidenceThreshold: Math.min(0.9, config.minimumConfidenceThreshold + 0.06)
          }, "Require confirmation and a valid profile together.")
        ]
      )
    );
  }

  if (missingIntermarketCount > 0) {
    diagnostics.push(
      diagnostic(
        "grinch_missing_intermarket_confirmation",
        `${missingIntermarketCount} SMT-unavailable decision(s)`,
        "SMT unavailable contributes 0 confirmation",
        "warning",
        "Missing ES/YM correlation data does not invalidate a setup by itself, but it cannot be counted as intermarket confirmation.",
        "Keep SMT unavailable as an evidence discount until correlated ES/YM data is imported.",
        [
          hint("SMT unavailable penalty", { minimumConfidenceThreshold: Math.min(0.9, config.minimumConfidenceThreshold + 0.04) }, "Discount confidence when intermarket confirmation is missing.")
        ]
      )
    );
  }

  if (summary.averageR < 0.15) {
    diagnostics.push(
      diagnostic(
        "average_r_too_low",
        r(summary.averageR),
        "0.15R+ minimum research quality",
        summary.averageR < 0.05 ? "blocking" : "warning",
        "The average payoff per simulated trade is too weak. A high profit factor cannot compensate if average R is near flat.",
        "Test target multiples and stop model variants, then reject low reward-to-risk setups.",
        [
          hint("1R target test", { targetRMultiple: 1 }, "Check whether smaller targets improve hit rate."),
          hint("1.5R target test", { targetRMultiple: 1.5 }, "Balance target quality with hit rate."),
          hint("2R target test", { targetRMultiple: 2 }, "Check whether reward improves without reducing win rate too much.")
        ]
      )
    );
  }

  if (summary.maxDrawdown > 4) {
    diagnostics.push(
      diagnostic(
        "max_drawdown_too_high",
        r(summary.maxDrawdown),
        "4.00R or lower preferred",
        summary.maxDrawdown > 6 ? "blocking" : "warning",
        "The simulated equity curve absorbs too much loss before stabilizing.",
        "Raise confidence/confluence modestly, restrict weak sessions, or test a tighter invalidation model.",
        [
          hint("Stricter confluence test", { minimumConfluenceThreshold: Math.min(0.85, config.minimumConfluenceThreshold + 0.06) }, "Reduce fragile setups."),
          hint("FVG invalidation drawdown test", { stopModel: "FVG invalidation" }, "Try a tighter ICT invalidation model."),
          hint("Fixed tick drawdown test", { stopModel: "fixed ticks", fixedTickStopSize: Math.max(20, config.fixedTickStopSize - 8) }, "Check bounded fixed risk.")
        ]
      )
    );
  }

  if (sessions.length > 1 && worstSession && bestSession && worstSession.averageR < -0.1 && bestSession.averageR > worstSession.averageR + 0.2) {
    const sessionPatch: BacktestSessionFilter =
      bestSession.session === "New York" ? "New York" : bestSession.session === "London" ? "London" : "all";
    diagnostics.push(
      diagnostic(
        "session_filter_weak",
        `${worstSession.session} ${r(worstSession.averageR)}`,
        `Prefer ${bestSession.session} ${r(bestSession.averageR)}`,
        "warning",
        "One session is dragging down the blended backtest result.",
        "Compare session-specific variants and avoid promoting all-session settings until the weak session is understood.",
        [
          hint(`${bestSession.session} session test`, { sessionFilter: sessionPatch }, "Preserve the strongest session behavior."),
          hint("NY AM kill-zone test", { sessionFilter: "NY AM Kill Zone" }, "Check a tighter New York futures window.")
        ]
      )
    );
  }

  if (biases.length > 1 && worstBias && bestBias && worstBias.averageR < -0.05 && bestBias.averageR > worstBias.averageR + 0.15) {
    diagnostics.push(
      diagnostic(
        "long_short_bias_weak",
        `${worstBias.bias} ${r(worstBias.averageR)}`,
        `Prefer ${bestBias.bias} ${r(bestBias.averageR)}`,
        "warning",
        "Long and short simulations are not contributing equally.",
        "Run long-only and short-only tests before keeping both directions enabled.",
        [
          hint("Long-only quality test", { allowLong: true, allowShort: false }, "Isolate bullish thesis quality."),
          hint("Short-only quality test", { allowLong: false, allowShort: true }, "Isolate bearish thesis quality.")
        ]
      )
    );
  }

  if (stopHitRate > 0.55) {
    diagnostics.push(
      diagnostic(
        "stop_model_weak",
        `${stopHits}/${totalTrades} stop hits`,
        "Stop hit rate below 55%",
        stopHitRate > 0.7 ? "blocking" : "warning",
        "The active invalidation model may not match the trade plan structure.",
        "Run fixed tick, latest swing, and FVG invalidation tests before changing thresholds.",
        stopModelHints(config.stopModel)
      )
    );
  }

  if (summary.averageR < 0.15 && config.targetRMultiple >= 2) {
    diagnostics.push(
      diagnostic(
        "target_r_mismatch",
        `${config.targetRMultiple.toFixed(2)}R target with ${r(summary.averageR)} average`,
        "Target should improve average R without collapsing win rate",
        "warning",
        "The target assumption may be too far away for the imported-data setups currently passing filters.",
        "Test 1R, 1.5R, 2R, and nearby-liquidity target assumptions.",
        [
          hint("Nearby liquidity target proxy", { targetRMultiple: 1.25 }, "Use a closer target proxy for historical quality testing."),
          hint("1.5R balanced target", { targetRMultiple: 1.5 }, "Balance payoff and resolution rate.")
        ]
      )
    );
  }

  if (lowRRatio > 0.45) {
    diagnostics.push(
      diagnostic(
        "too_many_low_r_trades",
        `${lowRTrades}/${totalTrades} trades at <= 0.25R`,
        "Less than 45% low-R outcomes",
        lowRRatio > 0.6 ? "blocking" : "warning",
        "Too many trades barely resolve or fail to generate meaningful R.",
        "Reject weak reward-to-risk setups with higher confidence/confluence or target/stop model tests.",
        [
          hint("Avoid low-R setup filter", {
            minimumConfidenceThreshold: Math.min(0.85, config.minimumConfidenceThreshold + 0.05),
            targetRMultiple: Math.max(1.25, Math.min(2, config.targetRMultiple))
          }, "Require better conviction and realistic reward."),
          hint("Risk/reward stop test", { stopModel: "latest swing", targetRMultiple: 1.5 }, "Test structural stop with a balanced target.")
        ]
      )
    );
  }

  if (falsePositiveRatio > 0.3) {
    diagnostics.push(
      diagnostic(
        "false_positive_cluster",
        `${falsePositiveProxy}/${totalTrades} low-MFE losses`,
        "Less than 30% low-MFE losses",
        falsePositiveRatio > 0.45 ? "blocking" : "warning",
        "A cluster of losing trades never moved favorably enough to justify the thesis.",
        "Use stronger confidence/confluence gates and session filters before approving a proposal.",
        [
          hint("Higher confidence false-positive filter", { minimumConfidenceThreshold: Math.min(0.88, config.minimumConfidenceThreshold + 0.08) }, "Filter weak CIO conviction."),
          hint("NY AM false-positive filter", { sessionFilter: "NY AM Kill Zone" }, "Check whether false positives cluster outside the main session.")
        ]
      )
    );
  }

  if (validation && !conservativeStable) {
    diagnostics.push(
      diagnostic(
        "conservative_scenario_unstable",
        validation.calibration.readinessStatus,
        "Research Ready or better under conservative scenario",
        "blocking",
        "The conservative validation baseline is not stable enough for promotion.",
        "Keep the candidate research-only and rerun conservative validation after targeted quality tests.",
        [
          hint("Conservative quality filter", {
            minimumConfluenceThreshold: Math.max(0.5, config.minimumConfluenceThreshold),
            minimumConfidenceThreshold: Math.max(0.55, config.minimumConfidenceThreshold)
          }, "Require conservative evidence before readiness review.")
        ]
      )
    );
  }

  return diagnostics;
}
