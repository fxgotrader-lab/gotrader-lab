import type {
  GrinchActiveProfile,
  GrinchConsolidationProfileState,
  GrinchConsolidationEntryIntent,
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput,
  GrinchPhase3ConsolidationModelOutput,
  GrinchProfileFallbackState,
  GrinchReversalEntryIntent,
  GrinchReversalProfileState,
  GrinchTimingGrade,
  GrinchTradeIntent
} from "@/lib/strategyLibrary/grinchStrategyTypes";

export interface GrinchEvaluatedProfile {
  profile: GrinchActiveProfile;
  state: string;
  timingGrade: GrinchTimingGrade;
  entryIntent: string;
  profileValid: boolean;
  timingValid: boolean;
  selectable: boolean;
  blockReason?: string;
}

export interface GrinchProfileSelection {
  activeProfile: GrinchActiveProfile;
  profileState: string;
  timingGrade: GrinchTimingGrade;
  entryIntent: string;
  fallbackState: GrinchProfileFallbackState;
  fallbackProfileUsed: "reversal" | "consolidation" | "none";
  modelOneBlocked: boolean;
  noValidProfile: boolean;
  evaluatedProfiles: GrinchEvaluatedProfile[];
  reasons: string[];
}

const timingValid = (grade: GrinchTimingGrade) => grade === "ideal" || grade === "acceptable";

const profileStateValid = (state: string) => state === "valid";

const evaluatedProfile = ({
  entryIntent,
  profile,
  state,
  timingGrade
}: {
  profile: GrinchActiveProfile;
  state: string;
  timingGrade: GrinchTimingGrade;
  entryIntent: string;
}): GrinchEvaluatedProfile => {
  const profileValid = profileStateValid(state);
  const timingOk = timingValid(timingGrade);
  const selectable = profile !== "none" && profileValid && timingOk;
  const blockReason = !profileValid
    ? `${profile.replace(/_/g, " ")} profile is ${state}`
    : !timingOk
      ? `${profile.replace(/_/g, " ")} timing is ${timingGrade}`
      : undefined;

  return {
    profile,
    state,
    timingGrade,
    entryIntent,
    profileValid,
    timingValid: timingOk,
    selectable,
    blockReason
  };
};

export function resolveGrinchActiveProfile({
  consolidation,
  phase1,
  reversal
}: {
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  phase1: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
}): GrinchProfileSelection {
  const modelOne = evaluatedProfile({
    profile: "model_1",
    state: phase1.modelOneState,
    timingGrade: phase1.timingGrade,
    entryIntent: phase1.tradeIntent
  });
  const reversalProfile = evaluatedProfile({
    profile: "reversal",
    state: reversal?.reversalProfileState ?? "not_present",
    timingGrade: reversal?.timingGrade ?? phase1.timingGrade,
    entryIntent: reversal?.entryIntent ?? "no_trade"
  });
  const consolidationProfile = evaluatedProfile({
    profile: "consolidation",
    state: consolidation?.consolidationProfileState ?? "not_present",
    timingGrade: consolidation?.timingGrade ?? phase1.timingGrade,
    entryIntent: consolidation?.entryIntent ?? "no_trade"
  });
  const evaluatedProfiles = [modelOne, reversalProfile, consolidationProfile];

  if (modelOne.selectable) {
    return {
      activeProfile: "model_1",
      profileState: modelOne.state,
      timingGrade: modelOne.timingGrade,
      entryIntent: modelOne.entryIntent,
      fallbackState: "none_required",
      fallbackProfileUsed: "none",
      modelOneBlocked: false,
      noValidProfile: false,
      evaluatedProfiles,
      reasons: ["Model 1 is valid and timing is inside the intended Grinch window."]
    };
  }

  const fallbackIntro = "Model 1 blocked. Evaluating Reversal/Consolidation fallback.";
  if (reversalProfile.selectable) {
    return {
      activeProfile: "reversal",
      profileState: reversalProfile.state,
      timingGrade: reversalProfile.timingGrade,
      entryIntent: reversalProfile.entryIntent,
      fallbackState: "reversal_fallback_selected",
      fallbackProfileUsed: "reversal",
      modelOneBlocked: true,
      noValidProfile: false,
      evaluatedProfiles,
      reasons: [fallbackIntro, "Reversal Profile is valid with acceptable timing."]
    };
  }

  if (consolidationProfile.selectable) {
    return {
      activeProfile: "consolidation",
      profileState: consolidationProfile.state,
      timingGrade: consolidationProfile.timingGrade,
      entryIntent: consolidationProfile.entryIntent,
      fallbackState: "consolidation_fallback_selected",
      fallbackProfileUsed: "consolidation",
      modelOneBlocked: true,
      noValidProfile: false,
      evaluatedProfiles,
      reasons: [fallbackIntro, "Consolidation Profile is valid with acceptable timing."]
    };
  }

  return {
    activeProfile: "none",
    profileState: "not_present",
    timingGrade: modelOne.timingGrade,
    entryIntent: "no_trade",
    fallbackState: modelOne.state === "weak" || modelOne.timingGrade === "expired"
      ? "model_1_blocked_evaluating_fallback"
      : "no_valid_profile",
    fallbackProfileUsed: "none",
    modelOneBlocked: true,
    noValidProfile: true,
    evaluatedProfiles,
    reasons: [
      fallbackIntro,
      "No valid Grinch profile in this window.",
      ...evaluatedProfiles.map((profile) => profile.blockReason).filter((reason): reason is string => Boolean(reason))
    ].slice(0, 6)
  };
}

export const grinchProfileStateFor = (
  profile: GrinchActiveProfile,
  phase1: Pick<GrinchPhase1ModelOutput, "modelOneState">,
  reversal?: Pick<GrinchPhase2ReversalModelOutput, "reversalProfileState">,
  consolidation?: Pick<GrinchPhase3ConsolidationModelOutput, "consolidationProfileState">
) => {
  if (profile === "model_1") return phase1.modelOneState;
  if (profile === "reversal") return reversal?.reversalProfileState ?? "not_present";
  if (profile === "consolidation") return consolidation?.consolidationProfileState ?? "not_present";
  return "not_present";
};

export type GrinchProfileIntent =
  | GrinchTradeIntent
  | GrinchReversalEntryIntent
  | GrinchConsolidationEntryIntent
  | "no_trade";

export type GrinchProfileState =
  | GrinchReversalProfileState
  | GrinchConsolidationProfileState
  | GrinchPhase1ModelOutput["modelOneState"]
  | "not_present";
