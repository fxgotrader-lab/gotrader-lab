import { analyzeGrinchPhase1 } from "@/lib/strategyLibrary/grinchPhase1Model";
import { analyzeGrinchPhase2Reversal } from "@/lib/strategyLibrary/grinchPhase2ReversalModel";
import { analyzeGrinchPhase3Consolidation } from "@/lib/strategyLibrary/grinchPhase3ConsolidationModel";
import { analyzeGrinchPhase4Smt } from "@/lib/strategyLibrary/grinchPhase4SmtModel";
import { resolveGrinchActiveProfile } from "@/lib/strategyLibrary/grinchProfileSelection";
import type {
  GrinchPhase1ContextInput,
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput,
  GrinchPhase3ConsolidationModelOutput,
  GrinchPhase4SmtModelOutput,
  GrinchStrategyScore,
  GrinchFalsePositiveBlocker,
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
    return 48;
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

const smtScore = (smt: GrinchPhase4SmtModelOutput) => {
  if (smt.smtState === "bullish_confirmation" || smt.smtState === "bearish_confirmation") {
    return smt.supportsActiveProfile === true ? 82 : 64;
  }
  if (smt.smtState === "conflict") {
    return 16;
  }
  if (smt.smtState === "unavailable") {
    return 0;
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
  const profile = resolveGrinchActiveProfile({ consolidation, phase1, reversal });

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
  const timingExpired = profile.timingGrade === "expired";
  const validTiming = profile.timingGrade === "ideal" || profile.timingGrade === "acceptable";
  const activeProfileWeak = profile.profileState === "weak";
  const activeProfileInvalid =
    profile.noValidProfile ||
    profile.activeProfile === "none" ||
    profile.profileState === "invalid" ||
    profile.profileState === "not_present";
  const strongPdArrayRespect =
    pdArrayHierarchyAlignment >= 80 && Boolean(phase1.activePdArrays[0]?.respected) && !phase1.activePdArrays[0]?.violated;
  const strongDisplacementConfirmation =
    phase1.entryConfirmation.displacementAway &&
    phase1.entryConfirmation.mssOrBos &&
    phase1.entryConfirmation.timeWindowAlignment &&
    entryConfirmationScore >= 78;
  const weakProfileWithoutConfirmation = activeProfileWeak && !(strongPdArrayRespect && strongDisplacementConfirmation && validTiming);
  const entryConfirmationWithoutValidProfile =
    entryConfirmationScore >= 70 && (timingExpired || activeProfileInvalid || weakProfileWithoutConfirmation);
  const smtUnavailable = smt.smtState === "unavailable";
  const falsePositiveBlockers: GrinchFalsePositiveBlocker[] = [
    timingExpired ? "timing_expired_trade" : undefined,
    weakProfileWithoutConfirmation ? "weak_profile_trade" : undefined,
    entryConfirmationWithoutValidProfile ? "entry_confirmation_without_valid_profile" : undefined,
    smtUnavailable ? "missing_intermarket_confirmation" : undefined
  ].filter((item): item is GrinchFalsePositiveBlocker => Boolean(item));
  const falsePositiveRisk = clamp(
    (100 - profileValidity) * 0.28 +
      (100 - pdArrayHierarchyAlignment) * 0.22 +
      (100 - timingAlignment) * 0.18 +
      (100 - entryConfirmationScore) * 0.2 +
      (smt.smtState === "conflict" ? 22 : 0) +
      (smtUnavailable ? 12 : 0) +
      (phase1.htfBias === "unclear" ? 12 : 0)
  );
  const rawGrinchModelScore = clamp(
    htfBiasAlignment * 0.15 +
      pdArrayHierarchyAlignment * 0.15 +
      openingPriceAlignment * 0.12 +
      timingAlignment * 0.13 +
      entryConfirmationScore * 0.15 +
      smtConfirmationScore * 0.08 +
      profileValidity * 0.22 -
      falsePositiveRisk * 0.12
  );
  const hardGateReason = profile.noValidProfile
    ? phase1.timingGrade === "expired"
      ? "grinch_timing_expired"
      : "grinch_no_valid_profile"
    : timingExpired
    ? "grinch_timing_expired"
    : activeProfileInvalid
      ? "grinch_profile_invalid"
      : weakProfileWithoutConfirmation
        ? "grinch_profile_weak_without_confirmation"
        : undefined;
  const setupQuality = hardGateReason ? "blocked" : activeProfileWeak || smtUnavailable ? "low_probability" : "eligible";
  const scoreConflict = rawGrinchModelScore >= 55 && Boolean(hardGateReason);
  if (scoreConflict) {
    falsePositiveBlockers.push("grinch_score_conflict");
  }
  const grinchModelScore = clamp(
    Math.min(
      rawGrinchModelScore,
      timingExpired ? 42 : 100,
      activeProfileInvalid ? 35 : 100,
      weakProfileWithoutConfirmation ? 48 : 100,
      scoreConflict ? 42 : 100
    )
  );
  const ruleBlocks = [
    phase1.htfBias === "unclear" ? "HTF draw unclear." : undefined,
    !phase1.activePdArrays.length ? "No active ranked PD array." : undefined,
    openingPriceAlignment < 45 ? "Opening-price alignment weak." : undefined,
    profile.modelOneBlocked && !profile.noValidProfile ? "Model 1 blocked. Evaluating Reversal/Consolidation fallback." : undefined,
    profile.noValidProfile ? "No valid Grinch profile in this window." : undefined,
    timingExpired ? "Grinch profile is weak and timing is expired; this should be treated as no-trade or low-probability." : undefined,
    timingAlignment < 45 && !timingExpired ? `Timing ${profile.timingGrade}; setup is not in a clean model window.` : undefined,
    entryConfirmationScore < 45 ? "Entry confirmation incomplete." : undefined,
    profile.activeProfile === "none" ? "No valid Model 1, reversal, or consolidation profile." : undefined,
    activeProfileWeak ? "Active Grinch profile is weak; profile evidence cannot raise confidence by itself." : undefined,
    entryConfirmationWithoutValidProfile ? "Entry confirmation is high, but timing/profile validity does not permit a Grinch trade." : undefined,
    smtUnavailable ? "SMT unavailable - correlated instruments missing; SMT contributes 0 and cannot imply confirmation." : undefined,
    scoreConflict ? "Grinch score conflict: alignment components are high, but a hard timing/profile gate blocks the setup." : undefined,
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
    ...profile.reasons.slice(0, 3),
    `HTF bias ${phase1.htfBias}; draw ${phase1.htfDrawOnLiquidity}.`,
    phase1.activePdArrays[0] ? `Top PD array: ${phase1.activePdArrays[0].label}.` : "No active PD array.",
    setupQuality === "blocked"
      ? `Hard Grinch gate: ${hardGateReason}.`
      : `Opening-price alignment ${round(openingPriceAlignment)} / timing ${profile.timingGrade}.`,
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
    timingGrade: profile.timingGrade,
    smtState: smt.smtState,
    setupQuality,
    hardGateReason,
    fallbackState: profile.fallbackState,
    fallbackProfileUsed: profile.fallbackProfileUsed,
    modelOneBlocked: profile.modelOneBlocked,
    noValidProfile: profile.noValidProfile,
    evaluatedProfiles: profile.evaluatedProfiles,
    falsePositiveBlockers: Array.from(new Set(falsePositiveBlockers)),
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
