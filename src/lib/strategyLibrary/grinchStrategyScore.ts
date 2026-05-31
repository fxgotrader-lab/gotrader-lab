import { analyzeGrinchPhase1 } from "@/lib/strategyLibrary/grinchPhase1Model";
import { analyzeGrinchPhase2Reversal } from "@/lib/strategyLibrary/grinchPhase2ReversalModel";
import { analyzeGrinchPhase3Consolidation } from "@/lib/strategyLibrary/grinchPhase3ConsolidationModel";
import { analyzeGrinchPhase4Smt } from "@/lib/strategyLibrary/grinchPhase4SmtModel";
import type {
  GrinchActiveProfile,
  GrinchPhase1ContextInput,
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput,
  GrinchPhase3ConsolidationModelOutput,
  GrinchPhase4SmtModelOutput,
  GrinchStrategyScore,
  GrinchTimingGrade
} from "@/lib/strategyLibrary/grinchStrategyTypes";

export interface GrinchStrategyScoreInput extends GrinchPhase1ContextInput {
  phase1?: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  smt?: GrinchPhase4SmtModelOutput;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
const round = (value: number, digits = 0) => Number(value.toFixed(digits));

const stateScore = (state?: string) => {
  if (state === "valid") {
    return 90;
  }
  if (state === "weak") {
    return 62;
  }
  if (state === "invalid") {
    return 18;
  }
  return 28;
};

const timingScore = (grade: GrinchTimingGrade) => {
  if (grade === "ideal") {
    return 92;
  }
  if (grade === "acceptable") {
    return 74;
  }
  if (grade === "early") {
    return 48;
  }
  if (grade === "late") {
    return 28;
  }
  return 8;
};

const activeProfileFor = ({
  consolidation,
  phase1,
  reversal
}: {
  consolidation: GrinchPhase3ConsolidationModelOutput;
  phase1: GrinchPhase1ModelOutput;
  reversal: GrinchPhase2ReversalModelOutput;
}): { activeProfile: GrinchActiveProfile; profileState: string; timingGrade: GrinchTimingGrade; entryIntent: string } => {
  if (consolidation.consolidationProfileState === "valid" || consolidation.consolidationProfileState === "weak") {
    return {
      activeProfile: "consolidation",
      profileState: consolidation.consolidationProfileState,
      timingGrade: consolidation.timingGrade,
      entryIntent: consolidation.entryIntent
    };
  }
  if (reversal.reversalProfileState === "valid" || reversal.reversalProfileState === "weak") {
    return {
      activeProfile: "reversal",
      profileState: reversal.reversalProfileState,
      timingGrade: reversal.timingGrade,
      entryIntent: reversal.entryIntent
    };
  }
  if (phase1.modelOneState === "valid" || phase1.modelOneState === "weak") {
    return {
      activeProfile: "model_1",
      profileState: phase1.modelOneState,
      timingGrade: phase1.timingGrade,
      entryIntent: phase1.tradeIntent
    };
  }
  return {
    activeProfile: "none",
    profileState: "not_present",
    timingGrade: phase1.timingGrade,
    entryIntent: "no_trade"
  };
};

const smtScore = (smt: GrinchPhase4SmtModelOutput) => {
  if (smt.smtState === "bullish_confirmation" || smt.smtState === "bearish_confirmation") {
    return smt.supportsActiveProfile === true ? 82 : 64;
  }
  if (smt.smtState === "conflict") {
    return 16;
  }
  if (smt.smtState === "unavailable") {
    return 38;
  }
  return 46;
};

export function calculateGrinchStrategyScore(input: GrinchStrategyScoreInput): GrinchStrategyScore {
  const latestCandle = input.candles[input.candles.length - 1];
  const options = {
    ...input.options,
    symbol: input.options?.symbol ?? latestCandle?.symbol,
    timeframe: input.options?.timeframe ?? latestCandle?.timeframe,
    currentTimestamp: input.options?.currentTimestamp ?? latestCandle?.timestamp
  };
  const phase1 = input.phase1 ?? analyzeGrinchPhase1({ ...input, options });
  const reversal = input.reversal ?? analyzeGrinchPhase2Reversal({ ...input, phase1, options });
  const consolidation = input.consolidation ?? analyzeGrinchPhase3Consolidation({ ...input, phase1, options });
  const smt = input.smt ?? analyzeGrinchPhase4Smt({ ...input, phase1, reversal, consolidation, options });
  const profile = activeProfileFor({ consolidation, phase1, reversal });

  const htfBiasAlignment =
    phase1.htfBias === "bullish" || phase1.htfBias === "bearish"
      ? phase1.htfDrawOnLiquidity === "buyside" || phase1.htfDrawOnLiquidity === "sellside"
        ? 82
        : 64
      : phase1.htfBias === "neutral"
        ? 48
        : 28;
  const pdArrayHierarchyAlignment = phase1.activePdArrays[0]
    ? clamp(55 + phase1.activePdArrays[0].strength * 45 + (phase1.activePdArrays[0].respected ? 10 : 0) - (phase1.activePdArrays[0].violated ? 24 : 0))
    : 24;
  const openingPriceAlignment = clamp(
    ((phase1.sundayOpenState.sensitivityScore + phase1.twelveAmOpenState.sensitivityScore) / 2) * 100 +
      (phase1.twelveAmOpenState.currentRelation !== "unknown" ? 8 : -8)
  );
  const timingAlignment = timingScore(profile.timingGrade);
  const entryConfirmationScore = clamp(phase1.entryConfirmation.confirmationScore * 100);
  const smtConfirmationScore = smtScore(smt);
  const profileValidity = stateScore(profile.profileState);
  const falsePositiveRisk = clamp(
    (100 - profileValidity) * 0.28 +
      (100 - pdArrayHierarchyAlignment) * 0.22 +
      (100 - timingAlignment) * 0.18 +
      (100 - entryConfirmationScore) * 0.2 +
      (smt.smtState === "conflict" ? 22 : 0) +
      (phase1.htfBias === "unclear" ? 12 : 0)
  );
  const grinchModelScore = clamp(
    htfBiasAlignment * 0.15 +
      pdArrayHierarchyAlignment * 0.15 +
      openingPriceAlignment * 0.12 +
      timingAlignment * 0.13 +
      entryConfirmationScore * 0.15 +
      smtConfirmationScore * 0.08 +
      profileValidity * 0.22 -
      falsePositiveRisk * 0.12
  );
  const ruleBlocks = [
    phase1.htfBias === "unclear" ? "HTF draw unclear." : undefined,
    !phase1.activePdArrays.length ? "No active ranked PD array." : undefined,
    openingPriceAlignment < 45 ? "Opening-price alignment weak." : undefined,
    timingAlignment < 45 ? `Timing ${profile.timingGrade}; setup is not in a clean model window.` : undefined,
    entryConfirmationScore < 45 ? "Entry confirmation incomplete." : undefined,
    profile.activeProfile === "none" ? "No valid Model 1, reversal, or consolidation profile." : undefined,
    smt.smtState === "conflict" ? "SMT conflicts with weak setup evidence." : undefined
  ].filter((item): item is string => Boolean(item));
  const missingEvidence = Array.from(new Set([
    ...phase1.missingEvidence,
    ...reversal.missingEvidence,
    ...consolidation.missingEvidence,
    ...smt.missingEvidence
  ])).slice(0, 10);
  const reasons = Array.from(new Set([
    `Active profile: ${profile.activeProfile.replace(/_/g, " ")} (${profile.profileState}).`,
    `HTF bias ${phase1.htfBias}; draw ${phase1.htfDrawOnLiquidity}.`,
    phase1.activePdArrays[0] ? `Top PD array: ${phase1.activePdArrays[0].label}.` : "No active PD array.",
    `Opening-price alignment ${round(openingPriceAlignment)} / timing ${profile.timingGrade}.`,
    `SMT ${smt.smtState}; pair ${smt.primaryPair}.`,
    ...phase1.reasons.slice(0, 3)
  ])).slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    grinchModelScore: round(grinchModelScore),
    activeProfile: profile.activeProfile,
    htfBiasAlignment: round(htfBiasAlignment),
    pdArrayHierarchyAlignment: round(pdArrayHierarchyAlignment),
    openingPriceAlignment: round(openingPriceAlignment),
    timingAlignment: round(timingAlignment),
    entryConfirmationScore: round(entryConfirmationScore),
    smtConfirmationScore: round(smtConfirmationScore),
    falsePositiveRisk: round(falsePositiveRisk),
    profileValidity: round(profileValidity),
    profileState: profile.profileState,
    smtState: smt.smtState,
    ruleBlocks,
    primaryRuleBlock: ruleBlocks[0],
    reasons,
    missingEvidence,
    safetyNotice: "Research-only Grinch score. Supporting evidence only; no broker execution, order placement, or readiness override."
  };
}

export const summarizeGrinchStrategyScore = (score?: GrinchStrategyScore) =>
  score
    ? `Grinch ${score.grinchModelScore}/100 / profile ${score.activeProfile.replace(/_/g, " ")} / false-positive risk ${score.falsePositiveRisk}/100 / SMT ${score.smtState.replace(/_/g, " ")}`
    : "Grinch strategy score unavailable.";
