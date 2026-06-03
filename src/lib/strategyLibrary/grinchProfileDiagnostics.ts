import type {
  GrinchActiveProfile,
  GrinchOpeningPriceReference,
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput,
  GrinchPhase3ConsolidationModelOutput,
  GrinchStrategyScore,
  GrinchTimingGrade
} from "@/lib/strategyLibrary/grinchStrategyTypes";
import { buildGrinchExpansionReplayDiagnostics, type GrinchExpansionReplayDiagnostics } from "@/lib/strategyLibrary/grinchExpansionReplayDiagnostics";
import type { SessionTimeMapping } from "@/lib/sessions";
import type { Candle } from "@/lib/types";

export interface GrinchProfileEvidenceRow {
  profile: Exclude<GrinchActiveProfile, "none">;
  label: string;
  state: string;
  timingGrade: GrinchTimingGrade | "unknown";
  entryIntent: string;
  profileValid: boolean;
  timingValid: boolean;
  selectable: boolean;
  candidateCount: number;
  blockReason: string;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchProfileEvidenceDiagnostics {
  rows: GrinchProfileEvidenceRow[];
  hardGateReason: string;
  noValidProfileReason: string;
  timingWindowStatus: string;
  candidateSummary: string;
  openingReferences: Array<{
    label: string;
    timestamp: string;
    localTimestamp: string;
    price: string;
    relation: string;
    timingZone: string;
    sourceTimestampZone: string;
    fallbackMethod: string;
    missingEvidence: string[];
  }>;
  sessionTimezoneAssumption: string;
  noValidProfileCount: number;
  calibrationReport: GrinchProfileCalibrationReport;
  expansionReplayDiagnostics: GrinchExpansionReplayDiagnostics;
}

export interface GrinchProfileEvidenceDiagnosticsInput {
  candles?: Candle[];
  phase1?: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  score?: GrinchStrategyScore;
  profileCandidateCounts?: Partial<Record<GrinchActiveProfile, number>>;
  noValidProfileCount?: number;
  regimeLabel?: string;
  regimeDataQuality?: string;
  sessionTimeMapping?: SessionTimeMapping;
}

export type GrinchCalibrationCandidateFamily =
  | "model_1_timing_recheck"
  | "reversal_expansion_confirmation"
  | "consolidation_range_tightness"
  | "liquidity_raid_detection"
  | "timing_window_sensitivity"
  | "pd_array_alignment_review";

export type GrinchFirstFailedGate =
  | "profile_evidence"
  | "timing"
  | "entry_confirmation"
  | "regime_mismatch"
  | "smt_confirmation"
  | "none";

export interface GrinchProfileCalibrationRow {
  profile: Exclude<GrinchActiveProfile, "none">;
  label: string;
  profileEvidence: string;
  timingStatus: string;
  missingConditions: string[];
  nearMissScore: number;
  firstFailedGate: GrinchFirstFailedGate;
  candidateCount: number;
  recommendedCalibrationFamily: GrinchCalibrationCandidateFamily;
  doNotChangeNotes: string[];
}

export interface GrinchProfileCalibrationReport {
  title: "Grinch Profile Calibration Report";
  rows: GrinchProfileCalibrationRow[];
  primaryFinding: string;
  regimeGuidance: string;
  recommendedFirstFamily: GrinchCalibrationCandidateFamily;
  sessionLocalTimeGuidance: string;
  timingWindowAssessment: string;
  doNotAutoApplyNotice: string;
}

const cleanToken = (value?: string) => (value ? value.replace(/_/g, " ") : "unknown");

const timingValid = (timingGrade?: string) => timingGrade === "ideal" || timingGrade === "acceptable";

const openingReferenceRow = (reference: GrinchOpeningPriceReference | undefined, fallbackLabel: string) => ({
  label: reference?.label ?? fallbackLabel,
  timestamp: reference?.timestamp ?? "not found",
  localTimestamp: reference?.localTimestampLabel ?? "not resolved",
  price: typeof reference?.price === "number" ? reference.price.toFixed(2) : "not found",
  relation: cleanToken(reference?.currentRelation),
  timingZone: reference?.timingZone ?? "literal_timestamp",
  sourceTimestampZone: reference?.sourceTimestampZone ?? "unknown",
  fallbackMethod: cleanToken(reference?.fallbackMethod),
  missingEvidence: reference?.missingEvidence ?? [`${fallbackLabel} was not found in the active candle window.`]
});

const capped = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const stateNearMissValue = (state: string) => {
  if (state === "valid") return 45;
  if (state === "weak") return 32;
  if (state === "invalid") return 12;
  return 8;
};

const timingNearMissValue = (timingGrade: string) => {
  if (timingGrade === "ideal") return 25;
  if (timingGrade === "acceptable") return 20;
  if (timingGrade === "early" || timingGrade === "late") return 10;
  return 2;
};

const entryIntentNearMissValue = (entryIntent: string) => {
  if (entryIntent === "retracement_entry" || entryIntent === "reversal_entry" || entryIntent === "continuation_entry") return 18;
  if (entryIntent === "wait_for_confirmation") return 9;
  return 0;
};

const firstFailedGateFor = (row: GrinchProfileEvidenceRow): GrinchFirstFailedGate => {
  if (!row.profileValid) return "profile_evidence";
  if (!row.timingValid) return "timing";
  if (row.entryIntent === "no_trade" || row.entryIntent === "wait_for_confirmation") return "entry_confirmation";
  return "none";
};

const uniqueItems = (items: Array<string | undefined>) =>
  items.filter((item): item is string => Boolean(item?.trim())).filter((item, index, array) => array.indexOf(item) === index);

const nearMissScoreFor = ({
  entryConfirmationScore,
  row
}: {
  entryConfirmationScore?: number;
  row: GrinchProfileEvidenceRow;
}) => {
  const entryScore =
    typeof entryConfirmationScore === "number"
      ? Math.max(0, Math.min(1, entryConfirmationScore)) * 20
      : entryIntentNearMissValue(row.entryIntent);
  const candidateBonus = Math.min(10, row.candidateCount * 3);
  return capped(stateNearMissValue(row.state) + timingNearMissValue(row.timingGrade) + entryScore + candidateBonus);
};

const recommendationFor = ({
  consolidation,
  phase1,
  regimeLabel,
  reversal,
  row
}: {
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  phase1?: GrinchPhase1ModelOutput;
  regimeLabel?: string;
  reversal?: GrinchPhase2ReversalModelOutput;
  row: GrinchProfileEvidenceRow;
}): GrinchCalibrationCandidateFamily => {
  if (row.profile === "model_1") {
    if (row.timingGrade === "expired" || row.timingGrade === "early" || row.timingGrade === "late") {
      return "model_1_timing_recheck";
    }
    if (!phase1?.activePdArrays.length) {
      return "pd_array_alignment_review";
    }
    return "timing_window_sensitivity";
  }
  if (row.profile === "reversal") {
    if (reversal?.twelveAmInteractionState !== "failed_to_interact" || reversal?.continuationBeyond12am === "unclear") {
      return "reversal_expansion_confirmation";
    }
    return row.timingGrade === "expired" ? "timing_window_sensitivity" : "pd_array_alignment_review";
  }
  if (row.profile === "consolidation") {
    if (!consolidation?.consolidationRange.isTight) {
      return "consolidation_range_tightness";
    }
    if (consolidation?.liquidityRaidState === "none" || consolidation?.liquidityRaidState === "unclear") {
      return "liquidity_raid_detection";
    }
    return regimeLabel === "range_high_vol" ? "liquidity_raid_detection" : "timing_window_sensitivity";
  }
  return "timing_window_sensitivity";
};

const evidenceSummaryFor = ({
  consolidation,
  phase1,
  reversal,
  row
}: {
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  phase1?: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
  row: GrinchProfileEvidenceRow;
}) => {
  if (row.profile === "model_1") {
    return [
      `state ${cleanToken(row.state)}`,
      `HTF ${cleanToken(phase1?.htfBias)}`,
      `draw ${cleanToken(phase1?.htfDrawOnLiquidity)}`,
      `PD arrays ${phase1?.activePdArrays.length ?? 0}`,
      `entry confirmation ${typeof phase1?.entryConfirmation.confirmationScore === "number" ? `${Math.round(phase1.entryConfirmation.confirmationScore * 100)}%` : "unknown"}`
    ].join(" / ");
  }
  if (row.profile === "reversal") {
    return [
      `state ${cleanToken(row.state)}`,
      `12AM ${cleanToken(reversal?.twelveAmInteractionState)}`,
      `London ${cleanToken(reversal?.londonBehavior)}`,
      `NY ${cleanToken(reversal?.nyReversalWindow)}`,
      `continuation ${cleanToken(reversal?.continuationBeyond12am)}`
    ].join(" / ");
  }
  return [
    `state ${cleanToken(row.state)}`,
    `range ${consolidation?.consolidationRange.isTight ? "tight" : "not tight"}`,
    `12AM ${cleanToken(consolidation?.twelveAmRelationship)}`,
    `raid ${cleanToken(consolidation?.liquidityRaidState)}`,
    `direction ${cleanToken(consolidation?.expectedExpansionDirection)}`
  ].join(" / ");
};

const doNotChangeNotesFor = (row: GrinchProfileEvidenceRow) =>
  uniqueItems([
    "Do not loosen production thresholds from this report.",
    "Use this row to pick a research candidate family only.",
    !row.timingValid ? "Keep session-local timing evaluation; test sensitivity in research mode before any change." : undefined,
    !row.profileValid ? "Treat invalid/weak profile evidence as a blocker until a dedicated calibration pass proves otherwise." : undefined
  ]);

const missingConditionsFor = (row: GrinchProfileEvidenceRow) =>
  uniqueItems([
    ...row.missingEvidence,
    !row.profileValid ? row.blockReason : undefined,
    !row.timingValid ? `Timing is ${cleanToken(row.timingGrade)}; ideal or acceptable is required.` : undefined,
    row.entryIntent === "no_trade" ? "Entry intent is no trade." : undefined
  ]).slice(0, 5);

const buildCalibrationReport = ({
  consolidation,
  hardGateReason,
  noValidProfileReason,
  phase1,
  regimeDataQuality,
  regimeLabel,
  reversal,
  rows
}: {
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  hardGateReason: string;
  noValidProfileReason: string;
  phase1?: GrinchPhase1ModelOutput;
  regimeDataQuality?: string;
  regimeLabel?: string;
  reversal?: GrinchPhase2ReversalModelOutput;
  rows: GrinchProfileEvidenceRow[];
}): GrinchProfileCalibrationReport => {
  const calibrationRows = rows.map((row) => ({
    profile: row.profile,
    label: row.label,
    profileEvidence: evidenceSummaryFor({ consolidation, phase1, reversal, row }),
    timingStatus: `${cleanToken(row.timingGrade)} / ${row.timingValid ? "inside selectable window" : "outside selectable window"}`,
    missingConditions: missingConditionsFor(row),
    nearMissScore: nearMissScoreFor({
      entryConfirmationScore: row.profile === "model_1" ? phase1?.entryConfirmation.confirmationScore : undefined,
      row
    }),
    firstFailedGate: firstFailedGateFor(row),
    candidateCount: row.candidateCount,
    recommendedCalibrationFamily: recommendationFor({ consolidation, phase1, regimeLabel, reversal, row }),
    doNotChangeNotes: doNotChangeNotesFor(row)
  }));
  const recommendedFirstFamily =
    calibrationRows
      .slice()
      .sort((a, b) => b.nearMissScore - a.nearMissScore || b.candidateCount - a.candidateCount)[0]
      ?.recommendedCalibrationFamily ?? "timing_window_sensitivity";
  const regimeGuidance =
    regimeLabel === "range_high_vol"
      ? `Regime is range high vol${regimeDataQuality ? ` (${regimeDataQuality})` : ""}; prioritize reversal/consolidation evidence review, but do not bypass profile/timing gates.`
      : regimeLabel
        ? `Regime is ${cleanToken(regimeLabel)}${regimeDataQuality ? ` (${regimeDataQuality})` : ""}; calibrate only against matching regime segments.`
        : "Regime context unavailable in this surface; calibrate by profile evidence and session timing only.";

  return {
    title: "Grinch Profile Calibration Report",
    rows: calibrationRows,
    primaryFinding: `${noValidProfileReason} Hard gate: ${hardGateReason}.`,
    regimeGuidance,
    recommendedFirstFamily,
    sessionLocalTimeGuidance:
      "Profile windows should be evaluated by session-local time. For MT5 index CFD/proxy data this means New York ICT timing, not the raw UTC clock.",
    timingWindowAssessment:
      "This report does not prove the production windows are too narrow; it identifies candidate families for research-only sensitivity tests.",
    doNotAutoApplyNotice:
      "Do not auto-apply these suggestions, loosen thresholds, or create trades. They are research candidate families only."
  };
};

export function buildGrinchProfileEvidenceDiagnostics({
  candles = [],
  consolidation,
  noValidProfileCount,
  phase1,
  profileCandidateCounts,
  regimeDataQuality,
  regimeLabel,
  reversal,
  score,
  sessionTimeMapping
}: GrinchProfileEvidenceDiagnosticsInput): GrinchProfileEvidenceDiagnostics {
  const evaluatedProfiles = score?.evaluatedProfiles ?? [];
  const evaluatedFor = (profile: Exclude<GrinchActiveProfile, "none">) =>
    evaluatedProfiles.find((candidate) => candidate.profile === profile);
  const modelOneEvaluation = evaluatedFor("model_1");
  const reversalEvaluation = evaluatedFor("reversal");
  const consolidationEvaluation = evaluatedFor("consolidation");

  const rows: GrinchProfileEvidenceRow[] = [
    {
      profile: "model_1",
      label: "Model 1",
      state: phase1?.modelOneState ?? modelOneEvaluation?.state ?? "not_present",
      timingGrade: phase1?.timingGrade ?? modelOneEvaluation?.timingGrade ?? "unknown",
      entryIntent: phase1?.tradeIntent ?? modelOneEvaluation?.entryIntent ?? "no_trade",
      profileValid: modelOneEvaluation?.profileValid ?? phase1?.modelOneState === "valid",
      timingValid: modelOneEvaluation?.timingValid ?? timingValid(phase1?.timingGrade),
      selectable: modelOneEvaluation?.selectable ?? false,
      candidateCount: profileCandidateCounts?.model_1 ?? 0,
      blockReason:
        modelOneEvaluation?.blockReason ??
        (phase1?.modelOneState === "valid" ? "Profile evidence present; waiting on timing/entry confirmation if not selectable." : "Model 1 profile is not valid."),
      reasons: phase1?.reasons ?? [],
      missingEvidence: phase1?.missingEvidence ?? []
    },
    {
      profile: "reversal",
      label: "Reversal",
      state: reversal?.reversalProfileState ?? reversalEvaluation?.state ?? "not_present",
      timingGrade: reversal?.timingGrade ?? reversalEvaluation?.timingGrade ?? "unknown",
      entryIntent: reversal?.entryIntent ?? reversalEvaluation?.entryIntent ?? "no_trade",
      profileValid: reversalEvaluation?.profileValid ?? reversal?.reversalProfileState === "valid",
      timingValid: reversalEvaluation?.timingValid ?? timingValid(reversal?.timingGrade),
      selectable: reversalEvaluation?.selectable ?? false,
      candidateCount: profileCandidateCounts?.reversal ?? 0,
      blockReason:
        reversalEvaluation?.blockReason ??
        (reversal?.reversalProfileState === "valid" ? "Reversal evidence present; timing must be ideal or acceptable." : "Reversal profile is not valid."),
      reasons: reversal?.reasons ?? [],
      missingEvidence: reversal?.missingEvidence ?? []
    },
    {
      profile: "consolidation",
      label: "Consolidation",
      state: consolidation?.consolidationProfileState ?? consolidationEvaluation?.state ?? "not_present",
      timingGrade: consolidation?.timingGrade ?? consolidationEvaluation?.timingGrade ?? "unknown",
      entryIntent: consolidation?.entryIntent ?? consolidationEvaluation?.entryIntent ?? "no_trade",
      profileValid: consolidationEvaluation?.profileValid ?? consolidation?.consolidationProfileState === "valid",
      timingValid: consolidationEvaluation?.timingValid ?? timingValid(consolidation?.timingGrade),
      selectable: consolidationEvaluation?.selectable ?? false,
      candidateCount: profileCandidateCounts?.consolidation ?? 0,
      blockReason:
        consolidationEvaluation?.blockReason ??
        (consolidation?.consolidationProfileState === "valid"
          ? "Consolidation evidence present; timing/raid/direction must align."
          : "Consolidation profile is not valid."),
      reasons: consolidation?.reasons ?? [],
      missingEvidence: consolidation?.missingEvidence ?? []
    }
  ];

  const hardGateReason = cleanToken(score?.hardGateReason);
  const noValidProfileReason =
    score?.primaryRuleBlock ??
    (score?.noValidProfile
      ? "No valid Model 1, Reversal, or Consolidation profile passed both evidence and timing gates."
      : "No Grinch no-valid-profile gate is active.");

  const calibrationReport = buildCalibrationReport({
    consolidation,
    hardGateReason,
    noValidProfileReason,
    phase1,
    regimeDataQuality,
    regimeLabel,
    reversal,
    rows
  });
  const expansionReplayDiagnostics = buildGrinchExpansionReplayDiagnostics({
    candles,
    phase1,
    reversal,
    sessionTimeMapping: sessionTimeMapping ?? phase1?.sessionTimeMapping
  });

  return {
    rows,
    hardGateReason,
    noValidProfileReason,
    timingWindowStatus: `Latest timing grade ${cleanToken(score?.timingGrade ?? phase1?.timingGrade)}; timing is valid only during ideal or acceptable Grinch windows.`,
    candidateSummary: `Model 1 ${profileCandidateCounts?.model_1 ?? 0} / Reversal ${profileCandidateCounts?.reversal ?? 0} / Consolidation ${profileCandidateCounts?.consolidation ?? 0} selectable candidates.`,
    openingReferences: [
      openingReferenceRow(phase1?.twelveAmOpenState, "12AM Open"),
      openingReferenceRow(phase1?.sundayOpenState, "Sunday Open")
    ],
    sessionTimezoneAssumption:
      phase1?.sessionTimeMapping
        ? `Timing zone ${phase1.sessionTimeMapping.timingZone}; source timestamp zone ${phase1.sessionTimeMapping.sourceTimestampZone}; session model ${phase1.sessionTimeMapping.sessionModel}. ${phase1.sessionTimeMapping.warnings[0] ?? ""}`
        : "Grinch timing is using the default literal candle timestamp clock.",
    noValidProfileCount: noValidProfileCount ?? 0,
    calibrationReport,
    expansionReplayDiagnostics
  };
}
