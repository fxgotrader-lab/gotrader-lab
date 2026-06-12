import {
  PAPER_DEMO_AUTHORITY,
  type PaperDemoCandidate,
  type PaperDemoCandidateStatus,
  type PaperDemoDailyChecklist,
  type PaperDemoDailyChecklistItem,
  type PaperDemoDailyChecklistItemId,
  type PaperDemoOperationsState,
  type PaperDemoSessionJournalEntry
} from "./paperDemoTypes";

export const PAPER_DEMO_OPERATIONS_STORAGE_KEY = "gotrader.paper-demo-operations.v1";
export const PAPER_DEMO_OPERATIONS_UPDATED_EVENT = "gotrader:paper-demo-operations-updated";

const MAX_CANDIDATES = 40;
const MAX_JOURNAL_ENTRIES = 80;

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const forbiddenSerializedPattern =
  /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:|"account(Data|Number)?"\s*:|"order(Data|Id|Route|Status)?"\s*:|"position(Data|Id)?"\s*:|"apiKey"\s*:|"token"\s*:|"password"\s*:|"mt5(Login|Password|Credentials)"\s*:|"base64"\s*:/i;

export const paperDemoStateIsCompact = (state: PaperDemoOperationsState): boolean =>
  !forbiddenSerializedPattern.test(JSON.stringify(state));

const emptyState = (): PaperDemoOperationsState => ({
  updatedAt: new Date().toISOString(),
  candidates: [],
  dailyChecklists: [],
  journalEntries: [],
  authority: PAPER_DEMO_AUTHORITY
});

const normalizeCandidate = (candidate: PaperDemoCandidate): PaperDemoCandidate => ({
  ...candidate,
  authority: PAPER_DEMO_AUTHORITY,
  executionIntent: "none",
  operatorNotes: Array.isArray(candidate.operatorNotes) ? candidate.operatorNotes.slice(0, 20) : [],
  blockers: Array.isArray(candidate.blockers) ? candidate.blockers.slice(0, 12) : [],
  warnings: Array.isArray(candidate.warnings) ? candidate.warnings.slice(0, 8) : []
});

export const defaultPaperDemoChecklistItems = (): PaperDemoDailyChecklistItem[] => [
  ["source_active", "Source active and not mock/sample", "Confirm the shared source banner is active and research-eligible."],
  ["symbol_timeframe_confirmed", "Symbol/timeframe confirmed", "Confirm requested symbol, broker symbol, and timeframe."],
  ["proxy_warning_reviewed", "CFD/proxy warning reviewed", "Confirm MT5 CFD/proxy data is not broker truth."],
  ["validation_chain_reviewed", "Validation chain reviewed", "Open the validation chain and confirm provenance."],
  ["replay_reviewed", "Replay status reviewed", "Review replay result before monitoring."],
  ["walk_forward_reviewed", "Walk-forward/OOS reviewed", "Review OOS status or needs-more-data warning."],
  ["evidence_quality_reviewed", "Evidence quality reviewed", "Review evidence summary and blockers."],
  ["research_maturity_reviewed", "Research maturity reviewed", "Review maturity score and next requirement."],
  ["paper_demo_blockers_reviewed", "Paper-Demo blockers reviewed", "Confirm candidate blockers are understood."],
  ["authority_none_confirmed", "No execution authority confirmed", "Confirm authority none/none/none."],
  ["operator_notes_completed", "Operator notes completed", "Write what would be watched and what invalidates the setup."]
].map(([id, label, detail]) => ({ id: id as PaperDemoDailyChecklistItemId, label, detail, completed: false }));

export function createPaperDemoDailyChecklist(date = new Date().toISOString().slice(0, 10)): PaperDemoDailyChecklist {
  return {
    id: `paper_demo_checklist_${date}`,
    date,
    updatedAt: new Date().toISOString(),
    items: defaultPaperDemoChecklistItems(),
    authority: PAPER_DEMO_AUTHORITY
  };
}

export function loadPaperDemoOperationsState(): PaperDemoOperationsState {
  if (!isBrowser()) return emptyState();
  try {
    const raw = window.localStorage.getItem(PAPER_DEMO_OPERATIONS_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PaperDemoOperationsState>;
    const state: PaperDemoOperationsState = {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates.map(normalizeCandidate).slice(0, MAX_CANDIDATES) : [],
      dailyChecklists: Array.isArray(parsed.dailyChecklists) ? parsed.dailyChecklists.slice(0, 20) : [],
      journalEntries: Array.isArray(parsed.journalEntries) ? parsed.journalEntries.slice(0, MAX_JOURNAL_ENTRIES) : [],
      authority: PAPER_DEMO_AUTHORITY
    };
    return paperDemoStateIsCompact(state) ? state : emptyState();
  } catch {
    return emptyState();
  }
}

export function savePaperDemoOperationsState(state: PaperDemoOperationsState): PaperDemoOperationsState {
  const compactState: PaperDemoOperationsState = {
    updatedAt: new Date().toISOString(),
    candidates: state.candidates.map(normalizeCandidate).slice(0, MAX_CANDIDATES),
    dailyChecklists: state.dailyChecklists.slice(0, 20).map((checklist) => ({ ...checklist, authority: PAPER_DEMO_AUTHORITY })),
    journalEntries: state.journalEntries
      .slice(0, MAX_JOURNAL_ENTRIES)
      .map((entry) => ({ ...entry, authority: PAPER_DEMO_AUTHORITY, researchOnly: true })),
    authority: PAPER_DEMO_AUTHORITY
  };
  if (!paperDemoStateIsCompact(compactState)) {
    throw new Error("Paper-Demo Operations storage rejected unsafe raw payload fields.");
  }
  if (isBrowser()) {
    window.localStorage.setItem(PAPER_DEMO_OPERATIONS_STORAGE_KEY, JSON.stringify(compactState));
    window.dispatchEvent(new Event(PAPER_DEMO_OPERATIONS_UPDATED_EVENT));
  }
  return compactState;
}

export function upsertPaperDemoCandidate(candidate: PaperDemoCandidate): PaperDemoOperationsState {
  const current = loadPaperDemoOperationsState();
  const nextCandidates = [normalizeCandidate(candidate), ...current.candidates.filter((item) => item.id !== candidate.id)];
  return savePaperDemoOperationsState({ ...current, candidates: nextCandidates });
}

export function updatePaperDemoCandidateStatus(
  candidateId: string,
  status: PaperDemoCandidateStatus
): PaperDemoOperationsState {
  const current = loadPaperDemoOperationsState();
  return savePaperDemoOperationsState({
    ...current,
    candidates: current.candidates.map((candidate) =>
      candidate.id === candidateId
        ? {
            ...candidate,
            status,
            updatedAt: new Date().toISOString(),
            authority: PAPER_DEMO_AUTHORITY,
            executionIntent: "none"
          }
        : candidate
    )
  });
}

export function addPaperDemoCandidateNote(candidateId: string, note: string): PaperDemoOperationsState {
  const trimmed = note.trim().slice(0, 500);
  if (!trimmed) return loadPaperDemoOperationsState();
  const current = loadPaperDemoOperationsState();
  return savePaperDemoOperationsState({
    ...current,
    candidates: current.candidates.map((candidate) =>
      candidate.id === candidateId
        ? {
            ...candidate,
            operatorNotes: [trimmed, ...candidate.operatorNotes].slice(0, 20),
            updatedAt: new Date().toISOString(),
            authority: PAPER_DEMO_AUTHORITY,
            executionIntent: "none"
          }
        : candidate
    )
  });
}

export function savePaperDemoDailyChecklist(checklist: PaperDemoDailyChecklist): PaperDemoOperationsState {
  const current = loadPaperDemoOperationsState();
  return savePaperDemoOperationsState({
    ...current,
    dailyChecklists: [
      { ...checklist, updatedAt: new Date().toISOString(), authority: PAPER_DEMO_AUTHORITY },
      ...current.dailyChecklists.filter((item) => item.id !== checklist.id)
    ]
  });
}

export function latestPaperDemoDailyChecklist(
  state: PaperDemoOperationsState = loadPaperDemoOperationsState()
): PaperDemoDailyChecklist {
  const today = new Date().toISOString().slice(0, 10);
  return state.dailyChecklists.find((checklist) => checklist.date === today) ?? createPaperDemoDailyChecklist(today);
}

export function appendPaperDemoSessionJournalEntry(entry: PaperDemoSessionJournalEntry): PaperDemoOperationsState {
  const current = loadPaperDemoOperationsState();
  return savePaperDemoOperationsState({
    ...current,
    journalEntries: [{ ...entry, researchOnly: true, authority: PAPER_DEMO_AUTHORITY }, ...current.journalEntries]
  });
}
