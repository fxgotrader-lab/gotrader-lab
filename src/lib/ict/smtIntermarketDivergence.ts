import type { Candle } from "@/lib/types";
import type {
  GrinchConsolidationProfileResult,
  GrinchHtfBias,
  GrinchPhase1ModelOutput,
  GrinchReversalProfileResult,
  GrinchSmtDivergenceType,
  GrinchSmtInstrument,
  GrinchSmtIntermarketResult,
  GrinchSmtLiquidityTaken,
  GrinchSmtPrimaryPair,
  GrinchSmtState,
  GrinchSmtSupportState
} from "@/lib/strategyLibrary/grinchStrategyTypes";

type SmtInstrument = Exclude<GrinchSmtInstrument, "unknown">;
type CandleMap = Partial<Record<SmtInstrument, Candle[]>>;
type DirectionalBias = Extract<GrinchHtfBias, "bullish" | "bearish"> | "unclear";

interface LiquidityBreakState {
  madeHigherHigh: boolean;
  madeLowerLow: boolean;
  priorHigh?: number;
  priorLow?: number;
  recentHigh?: number;
  recentLow?: number;
  missingEvidence: string[];
}

export interface DetectSmtIntermarketDivergenceInput {
  primaryCandles: Candle[];
  primaryInstrument?: GrinchSmtInstrument;
  correlatedCandles?: CandleMap;
  phase1: GrinchPhase1ModelOutput;
  reversal?: GrinchReversalProfileResult;
  consolidation?: GrinchConsolidationProfileResult;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export const normalizeSmtInstrument = (symbol?: string): GrinchSmtInstrument => {
  const upper = symbol?.toUpperCase();
  if (upper === "NQ" || upper === "MNQ" || upper === "NASDAQ" || upper === "NAS100") {
    return "NQ";
  }
  if (upper === "ES" || upper === "MES" || upper === "SPX" || upper === "SPY") {
    return "ES";
  }
  if (upper === "YM" || upper === "MYM" || upper === "US30" || upper === "DJI") {
    return "YM";
  }
  return "unknown";
};

const inferPrimaryInstrument = (candles: Candle[], explicit?: GrinchSmtInstrument): GrinchSmtInstrument => {
  if (explicit && explicit !== "unknown") {
    return explicit;
  }
  return normalizeSmtInstrument(candles[candles.length - 1]?.symbol);
};

const pairFor = (primary: GrinchSmtInstrument, candlesByInstrument: CandleMap): {
  pair: GrinchSmtPrimaryPair;
  first: GrinchSmtInstrument;
  second: GrinchSmtInstrument;
  missing: string[];
} => {
  if (primary === "NQ") {
    if (candlesByInstrument.ES?.length) {
      return { pair: "NQ_ES", first: "NQ", second: "ES", missing: [] };
    }
    if (candlesByInstrument.YM?.length) {
      return { pair: "NQ_YM", first: "NQ", second: "YM", missing: [] };
    }
    return {
      pair: "unavailable",
      first: "unknown",
      second: "unknown",
      missing: ["SMT unavailable - correlated ES/YM candles are missing for the primary NQ comparison."]
    };
  }
  if (primary === "ES") {
    if (candlesByInstrument.NQ?.length) {
      return { pair: "NQ_ES", first: "NQ", second: "ES", missing: [] };
    }
    if (candlesByInstrument.YM?.length) {
      return { pair: "ES_YM", first: "ES", second: "YM", missing: [] };
    }
    return {
      pair: "unavailable",
      first: "unknown",
      second: "unknown",
      missing: ["SMT unavailable - correlated NQ/YM candles are missing for the primary ES comparison."]
    };
  }
  if (primary === "YM") {
    if (candlesByInstrument.ES?.length) {
      return { pair: "ES_YM", first: "ES", second: "YM", missing: [] };
    }
    if (candlesByInstrument.NQ?.length) {
      return { pair: "NQ_YM", first: "NQ", second: "YM", missing: [] };
    }
    return {
      pair: "unavailable",
      first: "unknown",
      second: "unknown",
      missing: ["SMT unavailable - correlated NQ/ES candles are missing for the primary YM comparison."]
    };
  }
  return {
    pair: "unavailable",
    first: "unknown",
    second: "unknown",
    missing: ["SMT unavailable - primary instrument is not NQ, ES, or YM."]
  };
};

const highFor = (candles: Candle[]) => Math.max(...candles.map((candle) => candle.high));
const lowFor = (candles: Candle[]) => Math.min(...candles.map((candle) => candle.low));

const liquidityBreakStateFor = (candles: Candle[]): LiquidityBreakState => {
  if (candles.length < 24) {
    return {
      madeHigherHigh: false,
      madeLowerLow: false,
      missingEvidence: ["At least 24 candles are needed to compare recent liquidity against a prior window."]
    };
  }
  const recentWindow = candles.slice(-12);
  const priorWindow = candles.slice(-36, -12);
  if (!priorWindow.length || !recentWindow.length) {
    return {
      madeHigherHigh: false,
      madeLowerLow: false,
      missingEvidence: ["Prior and recent windows are required for SMT comparison."]
    };
  }
  const priorHigh = highFor(priorWindow);
  const priorLow = lowFor(priorWindow);
  const recentHigh = highFor(recentWindow);
  const recentLow = lowFor(recentWindow);
  const tolerance = Math.max(0.01, ((priorHigh + priorLow) / 2) * 0.00025);
  return {
    madeHigherHigh: recentHigh > priorHigh + tolerance,
    madeLowerLow: recentLow < priorLow - tolerance,
    priorHigh: round(priorHigh),
    priorLow: round(priorLow),
    recentHigh: round(recentHigh),
    recentLow: round(recentLow),
    missingEvidence: []
  };
};

const desiredBiasFor = ({
  consolidation,
  phase1,
  reversal
}: {
  consolidation?: GrinchConsolidationProfileResult;
  phase1: GrinchPhase1ModelOutput;
  reversal?: GrinchReversalProfileResult;
}): { bias: DirectionalBias; activeProfile: "model_1" | "reversal" | "consolidation" | "none"; profileState: string } => {
  if (
    consolidation &&
    (consolidation.consolidationProfileState === "valid" || consolidation.consolidationProfileState === "weak") &&
    (consolidation.expectedExpansionDirection === "bullish" || consolidation.expectedExpansionDirection === "bearish")
  ) {
    return {
      bias: consolidation.expectedExpansionDirection,
      activeProfile: "consolidation",
      profileState: consolidation.consolidationProfileState
    };
  }
  if (
    reversal &&
    (reversal.reversalProfileState === "valid" || reversal.reversalProfileState === "weak") &&
    (reversal.reversalBias === "bullish" || reversal.reversalBias === "bearish")
  ) {
    return {
      bias: reversal.reversalBias,
      activeProfile: "reversal",
      profileState: reversal.reversalProfileState
    };
  }
  if (phase1.modelOneState === "valid" || phase1.modelOneState === "weak") {
    return {
      bias: phase1.htfBias === "bullish" || phase1.htfBias === "bearish" ? phase1.htfBias : "unclear",
      activeProfile: "model_1",
      profileState: phase1.modelOneState
    };
  }
  return {
    bias: phase1.htfBias === "bullish" || phase1.htfBias === "bearish" ? phase1.htfBias : "unclear",
    activeProfile: "none",
    profileState: "not_present"
  };
};

const unavailableResult = (missingEvidence: string[], phase1: GrinchPhase1ModelOutput): GrinchSmtIntermarketResult => ({
  smtState: "unavailable",
  primaryPair: "unavailable",
  leaderInstrument: "unknown",
  nonConfirmingInstrument: "unknown",
  liquidityTaken: "unclear",
  divergenceType: "none",
  supportsBias: "unclear",
  supportsActiveProfile: "unclear",
  confidenceAdjustment: 0,
  conflictWarning: "SMT unavailable - correlated instruments missing.",
  reasons: [
    "SMT is confirmation only and is not allowed to create standalone bias.",
    `Primary HTF bias remains ${phase1.htfBias}; missing SMT should be treated as missing evidence, not a failed setup.`
  ],
  missingEvidence: Array.from(new Set(missingEvidence)).slice(0, 10)
});

const supportStateFor = (smtBias: DirectionalBias, desiredBias: DirectionalBias): GrinchSmtSupportState => {
  if (smtBias === "unclear" || desiredBias === "unclear") {
    return "unclear";
  }
  return smtBias === desiredBias;
};

const stateFor = (smtBias: DirectionalBias, desiredBias: DirectionalBias): GrinchSmtState => {
  if (smtBias === "unclear") {
    return "none";
  }
  if (desiredBias !== "unclear" && smtBias !== desiredBias) {
    return "conflict";
  }
  return smtBias === "bullish" ? "bullish_confirmation" : "bearish_confirmation";
};

export function detectSmtIntermarketDivergence(input: DetectSmtIntermarketDivergenceInput): GrinchSmtIntermarketResult {
  const primaryInstrument = inferPrimaryInstrument(input.primaryCandles, input.primaryInstrument);
  const candlesByInstrument: CandleMap = {
    ...input.correlatedCandles
  };
  if (primaryInstrument !== "unknown") {
    candlesByInstrument[primaryInstrument] = input.primaryCandles;
  }

  const pair = pairFor(primaryInstrument, candlesByInstrument);
  if (pair.pair === "unavailable" || pair.first === "unknown" || pair.second === "unknown") {
    return unavailableResult(pair.missing, input.phase1);
  }

  const firstCandles = candlesByInstrument[pair.first as SmtInstrument] ?? [];
  const secondCandles = candlesByInstrument[pair.second as SmtInstrument] ?? [];
  const firstBreak = liquidityBreakStateFor(firstCandles);
  const secondBreak = liquidityBreakStateFor(secondCandles);
  const missingEvidence = [...firstBreak.missingEvidence, ...secondBreak.missingEvidence];

  if (missingEvidence.length) {
    return unavailableResult(missingEvidence, input.phase1);
  }

  const firstTookSellside = firstBreak.madeLowerLow;
  const secondTookSellside = secondBreak.madeLowerLow;
  const firstTookBuyside = firstBreak.madeHigherHigh;
  const secondTookBuyside = secondBreak.madeHigherHigh;
  const bullishDivergence = firstTookSellside !== secondTookSellside;
  const bearishDivergence = firstTookBuyside !== secondTookBuyside;
  const desired = desiredBiasFor(input);
  let smtBias: DirectionalBias = "unclear";
  let divergenceType: GrinchSmtDivergenceType = "none";
  let liquidityTaken: GrinchSmtLiquidityTaken = "none";
  let leaderInstrument: GrinchSmtInstrument = "unknown";
  let nonConfirmingInstrument: GrinchSmtInstrument = "unknown";

  if (bullishDivergence && !bearishDivergence) {
    smtBias = "bullish";
    divergenceType = "lower_low_nonconfirmation";
    liquidityTaken = "sellside";
    leaderInstrument = firstTookSellside ? pair.first : pair.second;
    nonConfirmingInstrument = firstTookSellside ? pair.second : pair.first;
  } else if (bearishDivergence && !bullishDivergence) {
    smtBias = "bearish";
    divergenceType = "higher_high_nonconfirmation";
    liquidityTaken = "buyside";
    leaderInstrument = firstTookBuyside ? pair.first : pair.second;
    nonConfirmingInstrument = firstTookBuyside ? pair.second : pair.first;
  }

  const supportsBias = supportStateFor(smtBias, desired.bias);
  const supportsActiveProfile = desired.activeProfile === "none" ? "unclear" : supportsBias;
  const smtState = bullishDivergence && bearishDivergence
    ? "conflict"
    : stateFor(smtBias, desired.bias);
  const conflictWarning =
    smtState === "conflict"
      ? `SMT conflicts with the active ${desired.activeProfile.replace(/_/g, " ")} bias; lower confidence or block weak setups.`
      : undefined;
  const confidenceAdjustment = round(
    smtState === "bullish_confirmation" || smtState === "bearish_confirmation"
      ? supportsBias === true
        ? 0.12
        : 0.04
      : smtState === "conflict"
        ? -0.18
        : 0,
    2
  );
  const reasons = [
    smtState === "none"
      ? `No SMT divergence found on ${pair.pair}; missing SMT does not invalidate the setup.`
      : `${pair.pair} SMT reads ${smtState.replace(/_/g, " ")} using ${divergenceType.replace(/_/g, " ")}.`,
    leaderInstrument !== "unknown"
      ? `${leaderInstrument} took ${liquidityTaken} liquidity while ${nonConfirmingInstrument} failed to confirm.`
      : undefined,
    `SMT is confirmation only; HTF bias, PD reaction, opening-price context, and the 15m profile remain primary.`,
    input.phase1.timingGrade === "ideal" || input.phase1.timingGrade === "acceptable"
      ? `Timing is ${input.phase1.timingGrade}; SMT near the active Grinch timing window has stronger confirmation value.`
      : `Timing is ${input.phase1.timingGrade}; SMT confirmation is discounted outside the ideal window.`,
    input.phase1.activePdArrays[0]?.label
      ? `Active PD array context: ${input.phase1.activePdArrays[0].label}.`
      : undefined
  ].filter((reason): reason is string => Boolean(reason));

  return {
    smtState,
    primaryPair: pair.pair,
    leaderInstrument,
    nonConfirmingInstrument,
    liquidityTaken,
    divergenceType,
    supportsBias,
    supportsActiveProfile,
    confidenceAdjustment,
    conflictWarning,
    reasons: Array.from(new Set(reasons)).slice(0, 12),
    missingEvidence: []
  };
}
