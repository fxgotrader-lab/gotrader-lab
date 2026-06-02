import type { Candle } from "@/lib/types";
import type {
  CompositeRegimeLabel,
  RegimeClassification,
  RegimeClassifierInput,
  RegimeDataQuality,
  RegimeScores
} from "@/lib/regime/regimeTypes";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
const round = (value: number, digits = 3) => Number(value.toFixed(digits));

const latest = <T>(items: T[]) => items[items.length - 1];
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const normalize = (value: number, low: number, high: number) => clamp((value - low) / Math.max(0.000001, high - low));

const trueRange = (candles: Candle[]) =>
  candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });

const returnsFor = (candles: Candle[]) =>
  candles.slice(1).map((candle, index) => {
    const previousClose = candles[index]?.close ?? candle.close;
    return previousClose ? Math.log(candle.close / previousClose) : 0;
  });

const percentileRank = (values: number[], value: number) => {
  if (!values.length) {
    return 0;
  }
  const below = values.filter((item) => item <= value).length;
  return clamp(below / values.length);
};

const directionalEfficiency = (candles: Candle[]) => {
  if (candles.length < 3) {
    return 0;
  }
  const first = candles[0].close;
  const lastClose = latest(candles).close;
  const path = candles.slice(1).reduce((sum, candle, index) => sum + Math.abs(candle.close - candles[index].close), 0);
  return clamp(Math.abs(lastClose - first) / Math.max(0.000001, path));
};

const vwapFor = (candles: Candle[]) => {
  const totalVolume = candles.reduce((sum, candle) => sum + Math.max(0, candle.volume ?? 0), 0);
  if (totalVolume <= 0) {
    return average(candles.map((candle) => (candle.high + candle.low + candle.close) / 3));
  }
  return candles.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * Math.max(0, candle.volume ?? 0), 0) / totalVolume;
};

const crossCount = (candles: Candle[], reference: number) =>
  candles.slice(1).reduce((count, candle, index) => {
    const previous = candles[index];
    return (previous.close - reference) * (candle.close - reference) < 0 ? count + 1 : count;
  }, 0);

const activeHighImpactEvent = (input: RegimeClassifierInput, timestamp: string) => {
  const events = input.marketContext?.macro.economicCalendar ?? [];
  const nowMs = new Date(timestamp).getTime();
  return events.find((event) => {
    const eventMs = new Date(event.scheduledAt).getTime();
    const windowMs = 75 * 60 * 1000;
    return event.impact === "high" && Number.isFinite(eventMs) && Math.abs(eventMs - nowMs) <= windowMs;
  });
};

const dataQualityFor = (candleCount: number): RegimeDataQuality => {
  if (candleCount < 50) {
    return "insufficient";
  }
  if (candleCount < 100) {
    return "limited";
  }
  return "sufficient";
};

const sourceFingerprintFor = (candles: Candle[], symbol?: string, timeframe?: string) => {
  const first = candles[0];
  const lastCandle = latest(candles);
  return [
    "regime",
    symbol ?? first?.symbol ?? "unknown",
    timeframe ?? first?.timeframe ?? "unknown",
    candles.length,
    first?.timestamp ?? "none",
    lastCandle?.timestamp ?? "none",
    first?.close?.toFixed?.(4) ?? "none",
    lastCandle?.close?.toFixed?.(4) ?? "none"
  ].join(":");
};

const deriveScores = (candles: Candle[], input: RegimeClassifierInput): { scores: RegimeScores; details: string[]; conflicts: string[] } => {
  const recent = candles.slice(-40);
  const baseline = candles.slice(-160);
  const trs = trueRange(candles);
  const recentAtr = average(trs.slice(-14));
  const baselineAtr = average(trs.slice(-120));
  const atrRatio = recentAtr / Math.max(0.000001, baselineAtr);
  const recentReturns = returnsFor(recent);
  const realizedVol = Math.sqrt(average(recentReturns.map((value) => value * value))) * Math.sqrt(Math.max(1, recentReturns.length));
  const rollingVols = baseline
    .map((_, index) => baseline.slice(Math.max(0, index - 30), index + 1))
    .filter((window) => window.length >= 10)
    .map((window) => {
      const returns = returnsFor(window);
      return Math.sqrt(average(returns.map((value) => value * value))) * Math.sqrt(Math.max(1, returns.length));
    });
  const volatilityPercentile = percentileRank(rollingVols, realizedVol);
  const efficiency = directionalEfficiency(recent);
  const vwap = vwapFor(recent);
  const lastClose = latest(candles).close;
  const vwapDistanceAtr = (lastClose - vwap) / Math.max(0.000001, recentAtr);
  const vwapSlope = vwapFor(recent.slice(-20)) - vwapFor(recent.slice(0, 20));
  const crosses = crossCount(recent, vwap);
  const openingRange = candles.slice(0, Math.min(30, candles.length));
  const openingRangeSize = openingRange.length
    ? Math.max(...openingRange.map((candle) => candle.high)) - Math.min(...openingRange.map((candle) => candle.low))
    : 0;
  const recentRange = Math.max(...recent.map((candle) => candle.high)) - Math.min(...recent.map((candle) => candle.low));
  const expansionFactor = recentRange / Math.max(0.000001, openingRangeSize || baselineAtr);
  const momentumRaw = (lastClose - recent[0].close) / Math.max(0.000001, recentAtr * 3);
  const macroAvailable = input.marketContext?.macro.status !== "planned";
  const intermarketAvailable = input.marketContext?.intermarket.status !== "planned";
  const vix = macroAvailable ? input.marketContext?.macro.vix : undefined;
  const dxyRelationship = intermarketAvailable ? input.marketContext?.intermarket.dxyNqRelationship : undefined;
  const vixRelationship = intermarketAvailable ? input.marketContext?.intermarket.vixEquityRelationship : undefined;
  const yieldInversion =
    macroAvailable &&
    typeof input.marketContext?.macro.twoYearYield === "number" &&
    typeof input.marketContext?.macro.tenYearYield === "number" &&
    input.marketContext.macro.twoYearYield > input.marketContext.macro.tenYearYield;

  const volatility = clamp(normalize(atrRatio, 0.75, 1.8) * 0.45 + volatilityPercentile * 0.45 + normalize(expansionFactor, 0.7, 2.2) * 0.1);
  const trend_strength = clamp(efficiency * 0.68 + normalize(Math.abs(vwapDistanceAtr), 0.25, 2) * 0.2 + normalize(Math.abs(vwapSlope), 0, recentAtr) * 0.12);
  const chop = clamp((1 - efficiency) * 0.55 + normalize(crosses, 2, 12) * 0.3 + (volatility < 0.45 ? 0.15 : 0));
  const risk_off = clamp(
    normalize(vix ?? 16, 18, 35) * 0.45 +
      (vixRelationship === "risk_off" ? 0.25 : 0) +
      (dxyRelationship === "headwind" ? 0.15 : 0) +
      (yieldInversion ? 0.15 : 0)
  );
  const momentum = clamp((momentumRaw + 1) / 2);
  const mean_reversion = clamp(chop * 0.5 + normalize(crosses, 3, 14) * 0.25 + normalize(1 / Math.max(0.1, Math.abs(vwapDistanceAtr)), 0.2, 2) * 0.25);

  const conflicts = [
    trend_strength > 0.62 && chop > 0.62 ? "Trend and chop scores are both elevated." : undefined,
    risk_off > 0.65 && momentum > 0.62 ? "Risk-off context conflicts with bullish momentum." : undefined,
    volatility > 0.7 && mean_reversion > 0.68 ? "High volatility conflicts with mean-reversion stability." : undefined
  ].filter((item): item is string => Boolean(item));

  return {
    scores: {
      trend_strength: round(trend_strength),
      chop: round(chop),
      volatility: round(volatility),
      risk_off: round(risk_off),
      momentum: round(momentum),
      mean_reversion: round(mean_reversion)
    },
    details: [
      `ATR ratio ${atrRatio.toFixed(2)}`,
      `Realized volatility percentile ${Math.round(volatilityPercentile * 100)}%`,
      `Directional efficiency ${Math.round(efficiency * 100)}%`,
      `VWAP distance ${vwapDistanceAtr.toFixed(2)} ATR`,
      `VWAP crosses ${crosses}`,
      `Opening range expansion ${expansionFactor.toFixed(2)}x`
    ],
    conflicts
  };
};

const classifyInstantaneous = (
  scores: RegimeScores,
  candles: Candle[],
  input: RegimeClassifierInput,
  timestamp: string
): { label: CompositeRegimeLabel; confidence: number; factors: string[]; warnings: string[] } => {
  const event = activeHighImpactEvent(input, timestamp);
  const lastClose = latest(candles)?.close ?? 0;
  const recent = candles.slice(-40);
  const recentVwap = recent.length ? vwapFor(recent) : lastClose;
  const aboveVwap = lastClose >= recentVwap;
  const momentumBullish = scores.momentum >= 0.54;
  const momentumBearish = scores.momentum <= 0.46;

  if (event && scores.volatility >= 0.58) {
    return {
      label: "event_high_vol",
      confidence: clamp(0.58 + scores.volatility * 0.22 + scores.risk_off * 0.1),
      factors: [`High-impact ${event.name} window is active.`, "Volatility expanded during the event window."],
      warnings: ["Event regime blocks directional overconfidence until volatility normalizes."]
    };
  }

  if (scores.volatility >= 0.82 && scores.risk_off >= 0.7) {
    return {
      label: "risk_off_crisis",
      confidence: clamp(0.62 + scores.volatility * 0.18 + scores.risk_off * 0.18),
      factors: ["Volatility is extreme.", "Risk-off macro/intermarket context is elevated."],
      warnings: ["Risk-off crisis regime requires defensive research assumptions."]
    };
  }

  if (scores.trend_strength >= 0.58 && aboveVwap && momentumBullish) {
    return {
      label: "trend_bull",
      confidence: clamp(0.48 + scores.trend_strength * 0.28 + scores.momentum * 0.16 + (scores.chop < 0.52 ? 0.08 : 0)),
      factors: ["Directional efficiency is high.", "Price is above recent VWAP.", "Momentum is bullish."],
      warnings: scores.chop > 0.58 ? ["Chop score is elevated; trend classification needs confirmation."] : []
    };
  }

  if (scores.trend_strength >= 0.58 && !aboveVwap && momentumBearish) {
    return {
      label: "trend_bear",
      confidence: clamp(0.48 + scores.trend_strength * 0.28 + (1 - scores.momentum) * 0.16 + (scores.chop < 0.52 ? 0.08 : 0)),
      factors: ["Directional efficiency is high.", "Price is below recent VWAP.", "Momentum is bearish."],
      warnings: scores.chop > 0.58 ? ["Chop score is elevated; trend classification needs confirmation."] : []
    };
  }

  if (scores.trend_strength < 0.52 && scores.volatility < 0.62) {
    return {
      label: "range_low_vol",
      confidence: clamp(0.5 + scores.chop * 0.2 + (1 - scores.volatility) * 0.16),
      factors: ["Trend strength is low.", "Volatility is below baseline.", "Mean-reversion conditions dominate."],
      warnings: []
    };
  }

  return {
    label: "range_high_vol",
    confidence: clamp(0.48 + scores.volatility * 0.2 + scores.chop * 0.14),
    factors: ["Trend strength is not dominant.", "Volatility is elevated relative to baseline.", "Chop/mean-reversion risk is present."],
    warnings: scores.trend_strength > 0.54 ? ["Trend pressure is emerging; watch for transition confirmation."] : []
  };
};

const recommendedBehaviorFor = (label: CompositeRegimeLabel) => {
  switch (label) {
    case "trend_bull":
      return "Prefer bullish continuation/retracement research candidates only when ICT and Grinch timing confirm.";
    case "trend_bear":
      return "Prefer bearish continuation/retracement research candidates only when ICT and Grinch timing confirm.";
    case "range_low_vol":
      return "Prioritize mean-reversion/range diagnostics and avoid trend-chasing assumptions.";
    case "range_high_vol":
      return "Use smaller research assumptions, require cleaner confirmations, and test false-positive filters.";
    case "event_high_vol":
      return "Block or heavily discount new directional research during active high-impact event volatility.";
    case "risk_off_crisis":
      return "Use defensive crisis-mode diagnostics; do not promote readiness from this context alone.";
    case "insufficient_data":
      return "Do not use regime evidence for candidate promotion; collect more candles or correlated inputs.";
    default:
      return "Keep regime evidence as supporting context only.";
  }
};

const applyHysteresis = (
  instantaneousLabel: CompositeRegimeLabel,
  confidence: number,
  history: RegimeClassification[] = []
) => {
  const previous = history[0];
  const previousStableLabel = previous?.stableLabel;
  let persistence = 1;
  for (const item of history.slice(0, 5)) {
    if (item.instantaneousLabel !== instantaneousLabel) {
      break;
    }
    persistence += 1;
  }
  const requiredPersistence = confidence >= 0.82 ? 2 : 3;
  if (!previousStableLabel || previousStableLabel === "insufficient_data" || previousStableLabel === instantaneousLabel) {
    return {
      stableLabel: instantaneousLabel,
      transitionPending: false,
      transitionState: {
        previousStableLabel,
        observedPersistence: persistence,
        requiredPersistence,
        hysteresisApplied: false,
        reason: previousStableLabel === instantaneousLabel ? "Instantaneous label matches stable regime." : "No stable prior regime required hysteresis."
      }
    };
  }
  const confirmed = persistence >= requiredPersistence;
  return {
    stableLabel: confirmed ? instantaneousLabel : previousStableLabel,
    transitionPending: !confirmed,
    transitionState: {
      previousStableLabel,
      observedPersistence: persistence,
      requiredPersistence,
      hysteresisApplied: !confirmed,
      reason: confirmed
        ? "Regime transition met persistence requirements."
        : "Stable regime held until the new instantaneous label persists."
    }
  };
};

export function classifyMarketRegime(input: RegimeClassifierInput): RegimeClassification {
  const candles = (input.candles ?? []).filter(
    (candle) =>
      candle &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
  );
  const timestamp = input.timestamp ?? latest(candles)?.timestamp ?? new Date().toISOString();
  const symbol = input.symbol ?? candles[0]?.symbol;
  const timeframe = input.timeframe ?? candles[0]?.timeframe;
  const candleCount = candles.length;
  const dataQuality = dataQualityFor(candleCount);
  const sourceFingerprint = sourceFingerprintFor(candles, symbol, timeframe);
  const missingInputs = [
    candleCount < 100 ? `Need at least 100 candles for sufficient regime confidence; received ${candleCount}.` : undefined,
    input.marketContext?.mode === "future_provider"
      ? "Active candles come from a read-only external provider or CFD/proxy feed; use as research input only, not broker truth."
      : undefined,
    input.marketContext?.macro.status === "planned" ? "Real macro/VIX/DXY/yield inputs are not connected; mock/planned context only." : undefined,
    input.marketContext?.intermarket.status === "planned" ? "ES/NQ/YM dispersion is not fully connected." : undefined
  ].filter((item): item is string => Boolean(item));

  if (dataQuality === "insufficient") {
    const stable = applyHysteresis("insufficient_data", 0.25, input.history);
    return {
      regimeId: `regime_${sourceFingerprint}`,
      label: stable.stableLabel,
      instantaneousLabel: "insufficient_data",
      stableLabel: stable.stableLabel,
      transitionPending: stable.transitionPending,
      confidence: 0.25,
      dataQuality,
      supportingFactors: [`Only ${candleCount} candle(s) available.`],
      conflictScore: 0,
      scores: {
        trend_strength: 0,
        chop: 0,
        volatility: 0,
        risk_off: 0,
        momentum: 0,
        mean_reversion: 0
      },
      transitionState: stable.transitionState,
      recommendedBehavior: recommendedBehaviorFor("insufficient_data"),
      missingInputs,
      warnings: ["Regime fallback is insufficient_data; do not treat it as confirmation."],
      symbol,
      timeframe,
      candleCount,
      timestamp,
      sourceFingerprint
    };
  }

  const derived = deriveScores(candles, input);
  const classified = classifyInstantaneous(derived.scores, candles, input, timestamp);
  const contextConfidenceCap = missingInputs.length ? 0.72 : 1;
  const confidence = dataQuality === "limited"
    ? Math.min(classified.confidence, 0.62, contextConfidenceCap)
    : Math.min(classified.confidence, contextConfidenceCap);
  const stable = applyHysteresis(classified.label, confidence, input.history);
  const conflictScore = clamp(derived.conflicts.length * 0.22 + (stable.transitionPending ? 0.18 : 0));
  const warnings = [
    ...classified.warnings,
    ...derived.conflicts,
    dataQuality === "limited" ? "Limited candle count caps regime confidence." : undefined,
    missingInputs.length ? "Missing regime inputs cap regime confidence and prevent regime from acting as strong readiness evidence." : undefined,
    stable.transitionPending ? `Transition pending from ${stable.transitionState.previousStableLabel} to ${classified.label}.` : undefined
  ].filter((item): item is string => Boolean(item));

  return {
    regimeId: `regime_${sourceFingerprint}`,
    label: stable.stableLabel,
    instantaneousLabel: classified.label,
    stableLabel: stable.stableLabel,
    transitionPending: stable.transitionPending,
    confidence: round(confidence),
    dataQuality,
    supportingFactors: [...classified.factors, ...derived.details].slice(0, 10),
    conflictScore: round(conflictScore),
    scores: derived.scores,
    transitionState: stable.transitionState,
    recommendedBehavior: recommendedBehaviorFor(stable.stableLabel),
    missingInputs,
    warnings,
    symbol,
    timeframe,
    candleCount,
    timestamp,
    sourceFingerprint
  };
}

export function summarizeRegimeClassification(classification?: RegimeClassification) {
  if (!classification) {
    return "Regime unavailable.";
  }
  return `${classification.stableLabel.replace(/_/g, " ")} (${Math.round(classification.confidence * 100)}% confidence; ${classification.dataQuality}; transition ${classification.transitionPending ? "pending" : "stable"})`;
}
