import { runOpenClawPilotDryRun } from "@/lib/openclawPilot/openclawPilotDryRun";
import {
  loadOpenClawPilotProgram,
  openClawPilotAuthorityNone,
  summarizeOpenClawPilotProgram
} from "@/lib/openclawPilot/openclawProgram";
import type {
  OpenClawPilotDraftState,
  OpenClawPilotProposalDraft,
  OpenClawPilotDraftValidationStatus
} from "@/lib/openclawPilot/openclawPilotTypes";

type UnknownRecord = Record<string, unknown>;

export const OPENCLAW_PILOT_DRAFTS_STORAGE_KEY = "gotrader.openclaw-pilot-drafts.v1";
export const OPENCLAW_PILOT_DRAFTS_UPDATED_EVENT = "gotrader:openclaw-pilot-drafts-updated";

const MAX_STORED_DRAFTS = 20;

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const compactString = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 220) : fallback;
};

const getRecord = (value: unknown, key: string): UnknownRecord | undefined => {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
};

const getString = (value: unknown, path: string[]): string | undefined => {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor === undefined || cursor === null ? undefined : String(cursor);
};

const getBoolean = (value: unknown, path: string[], fallback: boolean) => {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return fallback;
    cursor = cursor[key];
  }
  return typeof cursor === "boolean" ? cursor : fallback;
};

const getStringArray = (value: unknown, path: string[]) => {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return [];
    cursor = cursor[key];
  }
  if (Array.isArray(cursor)) {
    return cursor.map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
  }
  if (typeof cursor === "string") {
    return cursor.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  }
  return [];
};

const draftHash = (value: string) =>
  Array.from(value).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0).toString(36).replace("-", "n");

const timestampToken = (value: string) => value.replace(/[^0-9a-z]/gi, "");

const inferOpenClawPilotStrategyId = (input: { candidateFamilies: string[]; targetSubsystem: string }) => {
  const text = [input.targetSubsystem, ...input.candidateFamilies].join(" ").toLowerCase();

  if (/silver[_\s-]*bullet.*v2|v2.*silver[_\s-]*bullet|refined.*silver[_\s-]*bullet|silver_bullet_v2/.test(text)) {
    return "silver_bullet_v2_refined_research";
  }
  if (/silver[_\s-]*bullet/.test(text)) {
    return "silver_bullet_v1";
  }
  if (/cameron/.test(text)) {
    return "camerons_model_research_v1";
  }
  if (/\bifvg\b|inversion.*fvg|inversion fair value/.test(text)) {
    return "ifvg_research_v1";
  }
  if (/turtle[_\s-]*soup/.test(text)) {
    return "turtle_soup_v1";
  }
  if (/\bcrt\b|candle[_\s-]*range/.test(text)) {
    return "crt_research_v1";
  }
  if (/\bote\b|optimal[_\s-]*trade/.test(text)) {
    return "ote_research_v1";
  }
  if (/\bcisd\b|change in state/.test(text)) {
    return "cisd_v1";
  }
  if (/\bamd\b|power of three|accumulation.*manipulation.*distribution/.test(text)) {
    return "amd_power_of_three_research_v1";
  }
  if (/cmd|consolidation[_\s-]*manipulation[_\s-]*distribution|independent[_\s-]*date/.test(text)) {
    return "ict_cmd_short_paper_watchlist_v1";
  }
  if (/reversal[_\s-]*expansion|expansion[_\s-]*confirmation/.test(text)) {
    return "grinch_reversal_expansion_confirmation_v1";
  }
  if (/model[_\s-]*1|model one/.test(text)) {
    return "grinch_model_1_research_v1";
  }
  if (/grinch.*consolidation|consolidation[_\s-]*range[_\s-]*tightness/.test(text)) {
    return "grinch_consolidation_research_v1";
  }
  if (/pd[_\s-]*array/.test(text)) {
    return "pd_array_setup_research_v1";
  }
  if (/scalp/.test(text)) {
    return "scalp_setup_research_v1";
  }
  if (/market[_\s-]*map|diagnostic/.test(text)) {
    return "market_map_only_diagnostic_v1";
  }

  return undefined;
};

const emptyState = (timestamp = new Date().toISOString()): OpenClawPilotDraftState => ({
  updatedAt: timestamp,
  drafts: [],
  authority: openClawPilotAuthorityNone
});

const safeParseState = (raw: string | null): OpenClawPilotDraftState => {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<OpenClawPilotDraftState>;
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.filter(isOpenClawPilotProposalDraft) : [];
    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      latestDraftId: typeof parsed.latestDraftId === "string" ? parsed.latestDraftId : undefined,
      latestBlockedId: typeof parsed.latestBlockedId === "string" ? parsed.latestBlockedId : undefined,
      drafts,
      authority: openClawPilotAuthorityNone
    };
  } catch {
    return emptyState();
  }
};

const forbiddenSerializedPattern =
  /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:|"account(Data|Number)?"\s*:|"order(Data|Id|Route)?"\s*:|"position(Data|Id)?"\s*:|"apiKey"\s*:|"token"\s*:|"password"\s*:|"mt5(Login|Password|Credentials)"\s*:|"base64"\s*:/i;

export const openClawPilotDraftStateIsCompact = (state: OpenClawPilotDraftState): boolean =>
  !forbiddenSerializedPattern.test(JSON.stringify(state));

function isOpenClawPilotProposalDraft(value: unknown): value is OpenClawPilotProposalDraft {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.proposalTitle === "string" &&
    Array.isArray(value.candidateFamilies) &&
    value.autoApplyAllowed === false &&
    isRecord(value.authority) &&
    value.authority.executionAuthority === "none" &&
    value.authority.brokerAuthority === "none" &&
    value.authority.readinessOverrideAuthority === "none"
  );
}

export function loadOpenClawPilotDraftState(): OpenClawPilotDraftState {
  if (!isBrowser()) return emptyState();
  return safeParseState(window.localStorage.getItem(OPENCLAW_PILOT_DRAFTS_STORAGE_KEY));
}

export function saveOpenClawPilotDraftState(state: OpenClawPilotDraftState): OpenClawPilotDraftState {
  const timestamp = new Date().toISOString();
  const compactState: OpenClawPilotDraftState = {
    updatedAt: timestamp,
    latestDraftId: state.latestDraftId,
    latestBlockedId: state.latestBlockedId,
    drafts: state.drafts
      .filter(isOpenClawPilotProposalDraft)
      .slice(0, MAX_STORED_DRAFTS)
      .map((draft) => ({
        ...draft,
        autoApplyAllowed: false,
        authority: openClawPilotAuthorityNone
      })),
    authority: openClawPilotAuthorityNone
  };

  if (!openClawPilotDraftStateIsCompact(compactState)) {
    throw new Error("OpenClaw pilot draft storage rejected unsafe raw payload fields.");
  }

  if (isBrowser()) {
    window.localStorage.setItem(OPENCLAW_PILOT_DRAFTS_STORAGE_KEY, JSON.stringify(compactState));
    window.dispatchEvent(new CustomEvent(OPENCLAW_PILOT_DRAFTS_UPDATED_EVENT));
  }
  return compactState;
}

export function latestOpenClawPilotDraft(state: OpenClawPilotDraftState = loadOpenClawPilotDraftState()) {
  return state.drafts.find((draft) => draft.id === state.latestDraftId) ??
    state.drafts.find((draft) => draft.validationStatus !== "blocked");
}

export function latestBlockedOpenClawPilotDraft(state: OpenClawPilotDraftState = loadOpenClawPilotDraftState()) {
  return state.drafts.find((draft) => draft.id === state.latestBlockedId) ??
    state.drafts.find((draft) => draft.validationStatus === "blocked");
}

export function buildOpenClawPilotProposalDraft(
  packet: unknown,
  options: { timestamp?: string; validationChainId?: string } = {}
): OpenClawPilotProposalDraft {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const program = loadOpenClawPilotProgram();
  const programSummary = summarizeOpenClawPilotProgram(program);
  const audit = runOpenClawPilotDryRun(packet, { timestamp, program });
  const intent = getRecord(packet, "selfImprovementProposalIntent") ?? getRecord(packet, "proposalIntent") ?? {};
  const title = compactString(
    getString(intent, ["proposalTitle"]) ?? getString(intent, ["title"]) ?? audit.relatedIntentId,
    "OpenClaw pilot proposal intent"
  );
  const targetSubsystem = compactString(
    getString(intent, ["targetSubsystem"]) ?? getString(intent, ["subsystem"]),
    "GoTrader deterministic research"
  );
  const candidateFamilies = getStringArray(intent, ["candidateFamilies"]);
  const strategyId =
    getString(intent, ["strategyId"]) ??
    inferOpenClawPilotStrategyId({
      candidateFamilies,
      targetSubsystem
    });
  const strategyFamily = getString(intent, ["strategyFamily"]);
  const unknownFamilies = candidateFamilies.filter((family) => !program.allowedProposalFamilies.includes(family));
  const validationStatus: OpenClawPilotDraftValidationStatus = !audit.validationResult?.valid
    ? "blocked"
    : unknownFamilies.length
      ? "needs_human_review"
      : "safe_draft";
  const blockedReason =
    validationStatus === "blocked"
      ? audit.validationResult?.errors.join("; ") || "OpenClaw pilot dry-run rejected this intent."
      : validationStatus === "needs_human_review"
        ? `Candidate family requires human review before deterministic validation: ${unknownFamilies.join(", ")}.`
        : undefined;
  const nextAction =
    validationStatus === "blocked"
      ? "Remove blocked fields and rerun the OpenClaw pilot dry-run."
      : validationStatus === "needs_human_review"
        ? "Review the candidate family against docs/openclaw/program.md before queuing tests."
        : "Queue deterministic validation; replay and walk-forward must pass before progression.";

  return {
    id: `openclaw_pilot_draft_${timestampToken(timestamp)}_${draftHash(`${title}|${targetSubsystem}`)}`,
    timestamp,
    programVersion: programSummary.version,
    dryRunAuditId: audit.auditId,
    sourceFingerprint: audit.sourceFingerprint,
    requestedSymbol: audit.requestedSymbol,
    brokerSymbol: audit.brokerSymbol,
    timeframe:
      getString(packet, ["timeframe"]) ??
      getString(packet, ["latestCycle", "timeframe"]) ??
      getString(packet, ["sourceContext", "timeframe"]),
    sourceProvider: audit.sourceProvider,
    validationChainId: options.validationChainId,
    strategyId,
    strategyFamily,
    proposalTitle: title,
    targetSubsystem,
    candidateFamilies,
    requiresReplay: getBoolean(intent, ["requiresReplay"], true),
    requiresWalkForward: getBoolean(intent, ["requiresWalkForward"], true),
    autoApplyAllowed: false,
    authority: openClawPilotAuthorityNone,
    validationStatus,
    blockedReason,
    blockedFields: audit.blockedFields ?? [],
    requiredValidationGates: programSummary.requiredValidationGates,
    nextAction,
    compactSummary: audit.compactSummary ?? audit.summary
  };
}

export function upsertOpenClawPilotProposalDraft(draft: OpenClawPilotProposalDraft): OpenClawPilotDraftState {
  const current = loadOpenClawPilotDraftState();
  const withoutDuplicate = current.drafts.filter((item) => item.id !== draft.id);
  const nextDrafts = [draft, ...withoutDuplicate].slice(0, MAX_STORED_DRAFTS);
  return saveOpenClawPilotDraftState({
    updatedAt: new Date().toISOString(),
    latestDraftId: draft.validationStatus === "blocked" ? current.latestDraftId : draft.id,
    latestBlockedId: draft.validationStatus === "blocked" ? draft.id : current.latestBlockedId,
    drafts: nextDrafts,
    authority: openClawPilotAuthorityNone
  });
}

export function recordOpenClawPilotProposalIntent(
  packet: unknown,
  options: { timestamp?: string; validationChainId?: string } = {}
) {
  const draft = buildOpenClawPilotProposalDraft(packet, options);
  const state = upsertOpenClawPilotProposalDraft(draft);
  return { draft, state };
}

export function markOpenClawPilotDraftQueued(draftId: string): OpenClawPilotDraftState {
  const current = loadOpenClawPilotDraftState();
  return saveOpenClawPilotDraftState({
    ...current,
    latestDraftId: draftId,
    drafts: current.drafts.map((draft) =>
      draft.id === draftId && draft.validationStatus !== "blocked"
        ? {
            ...draft,
            validationStatus: "queued_for_deterministic_validation",
            nextAction: "Run replay, walk-forward, evidence, maturity, readiness, and committee review."
          }
        : draft
    ),
    authority: openClawPilotAuthorityNone
  });
}

export function dismissOpenClawPilotDraft(draftId: string): OpenClawPilotDraftState {
  const current = loadOpenClawPilotDraftState();
  const drafts = current.drafts.filter((draft) => draft.id !== draftId);
  return saveOpenClawPilotDraftState({
    updatedAt: new Date().toISOString(),
    latestDraftId: current.latestDraftId === draftId ? drafts.find((draft) => draft.validationStatus !== "blocked")?.id : current.latestDraftId,
    latestBlockedId: current.latestBlockedId === draftId ? drafts.find((draft) => draft.validationStatus === "blocked")?.id : current.latestBlockedId,
    drafts,
    authority: openClawPilotAuthorityNone
  });
}
