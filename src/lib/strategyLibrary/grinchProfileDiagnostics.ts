import type {
  GrinchActiveProfile,
  GrinchOpeningPriceReference,
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput,
  GrinchPhase3ConsolidationModelOutput,
  GrinchStrategyScore,
  GrinchTimingGrade
} from "@/lib/strategyLibrary/grinchStrategyTypes";

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
    price: string;
    relation: string;
    missingEvidence: string[];
  }>;
  sessionTimezoneAssumption: string;
  noValidProfileCount: number;
}

export interface GrinchProfileEvidenceDiagnosticsInput {
  phase1?: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  score?: GrinchStrategyScore;
  profileCandidateCounts?: Partial<Record<GrinchActiveProfile, number>>;
  noValidProfileCount?: number;
}

const cleanToken = (value?: string) => (value ? value.replace(/_/g, " ") : "unknown");

const timingValid = (timingGrade?: string) => timingGrade === "ideal" || timingGrade === "acceptable";

const openingReferenceRow = (reference: GrinchOpeningPriceReference | undefined, fallbackLabel: string) => ({
  label: reference?.label ?? fallbackLabel,
  timestamp: reference?.timestamp ?? "not found",
  price: typeof reference?.price === "number" ? reference.price.toFixed(2) : "not found",
  relation: cleanToken(reference?.currentRelation),
  missingEvidence: reference?.missingEvidence ?? [`${fallbackLabel} was not found in the active candle window.`]
});

export function buildGrinchProfileEvidenceDiagnostics({
  consolidation,
  noValidProfileCount,
  phase1,
  profileCandidateCounts,
  reversal,
  score
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
      "Grinch timing currently reads the literal HH:mm in candle.timestamp. No MT5 CFD broker-session calendar or New York-time conversion is applied in this diagnostic pass.",
    noValidProfileCount: noValidProfileCount ?? 0
  };
}
