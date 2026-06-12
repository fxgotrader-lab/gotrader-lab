import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, NotebookPen, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SourceStatusBanner } from "@/components/common/SourceStatusBanner";
import { ValidationChainCard } from "@/components/common/ValidationChainCard";
import { WORKSPACE_CARD, WORKSPACE_PAGE, WORKSPACE_SECTION_LABEL, WORKSPACE_TABS } from "@/components/common/workspaceStyles";
import { WorkspaceEmptyState } from "@/components/common/WorkspaceEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTO_PAPER_DEMO_CYCLE_UPDATED_EVENT,
  appendPaperDemoSessionJournalEntry,
  buildPaperDemoCandidateFromContext,
  buildPaperDemoEligibility,
  buildPaperDemoReport,
  formatPaperDemoReport,
  loadAutoPaperDemoCycleState,
  latestPaperDemoDailyChecklist,
  loadPaperDemoOperationsState,
  PAPER_DEMO_AUTHORITY,
  PAPER_DEMO_OPERATIONS_UPDATED_EVENT,
  runAutoPaperDemoCycle,
  savePaperDemoDailyChecklist,
  stopAutoPaperDemoCycle,
  toPaperDemoWatchlistStatus,
  updatePaperDemoCandidateStatus,
  upsertPaperDemoCandidate,
  type AutoPaperDemoCycleState,
  type PaperDemoCandidate,
  type PaperDemoCandidateStatus,
  type PaperDemoDailyChecklist,
  type PaperDemoOperationsState
} from "@/lib/paperDemoOperations";
import { resolveSourceStatusSnapshot, type SourceStatusSnapshot } from "@/lib/sourceStatus";
import { latestValidationChainEntry, readValidationChainState, type ValidationChainEntry } from "@/lib/validationChain";
import { cn } from "@/lib/utils";

type PaperDemoTab = "overview" | "watchlist" | "auto" | "checklist" | "detail" | "journal" | "export";
type PaperDemoJournalForm = {
  symbol: string;
  setup: string;
  observation: string;
  watchedCondition: string;
  invalidation: string;
  evidenceNeeded: string;
  operatorConfidence: "low" | "medium" | "high";
};

const tabs: Array<{ id: PaperDemoTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "watchlist", label: "Watchlist" },
  { id: "auto", label: "Auto Cycle" },
  { id: "checklist", label: "Daily Checklist" },
  { id: "detail", label: "Candidate Detail" },
  { id: "journal", label: "Session Journal" },
  { id: "export", label: "Export / Report" }
];

const statusVariant = (status?: string) =>
  status === "monitoring" || status === "watchlist" || status === "eligible"
    ? "success"
    : status === "blocked" || status === "failed"
      ? "danger"
      : status === "eligible_with_warning" || status === "needs_more_data"
        ? "warning"
        : "secondary";

const formatToken = (value?: string) => (value?.trim() ? value : "unknown").replace(/_/g, " ");
const nowIso = () => new Date().toISOString();

function usePaperDemoState() {
  const [state, setState] = useState<PaperDemoOperationsState>(() => loadPaperDemoOperationsState());
  useEffect(() => {
    const refresh = () => setState(loadPaperDemoOperationsState());
    window.addEventListener(PAPER_DEMO_OPERATIONS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PAPER_DEMO_OPERATIONS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return [state, setState] as const;
}

function useAutoPaperDemoCycleState() {
  const [state, setState] = useState<AutoPaperDemoCycleState>(() => loadAutoPaperDemoCycleState());
  useEffect(() => {
    const refresh = () => setState(loadAutoPaperDemoCycleState());
    window.addEventListener(AUTO_PAPER_DEMO_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTO_PAPER_DEMO_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return [state, setState] as const;
}

function useSourceAndValidation() {
  const [source, setSource] = useState<SourceStatusSnapshot | undefined>();
  const [validationChain, setValidationChain] = useState<ValidationChainEntry | undefined>(() =>
    latestValidationChainEntry(readValidationChainState())
  );

  useEffect(() => {
    let active = true;
    resolveSourceStatusSnapshot()
      .then((snapshot) => {
        if (active) setSource(snapshot);
      })
      .catch(() => {
        if (active) setSource(undefined);
      });
    const refreshChain = () => setValidationChain(latestValidationChainEntry(readValidationChainState()));
    window.addEventListener("gotrader:validation-chain-updated", refreshChain);
    return () => {
      active = false;
      window.removeEventListener("gotrader:validation-chain-updated", refreshChain);
    };
  }, []);

  return { source, validationChain };
}

export function PaperDemoOperationsView() {
  const [activeTab, setActiveTab] = useState<PaperDemoTab>("overview");
  const [state, setState] = usePaperDemoState();
  const [autoCycleState, setAutoCycleState] = useAutoPaperDemoCycleState();
  const { source, validationChain } = useSourceAndValidation();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | undefined>();
  const [candidateNote, setCandidateNote] = useState("");
  const [autoCycleBusy, setAutoCycleBusy] = useState(false);
  const [journalForm, setJournalForm] = useState<PaperDemoJournalForm>({
    symbol: "MNQ",
    setup: "Current research setup",
    observation: "",
    watchedCondition: "",
    invalidation: "",
    evidenceNeeded: "",
    operatorConfidence: "medium" as const
  });

  const currentCandidate = useMemo(
    () => buildPaperDemoCandidateFromContext({ source, validationChain }),
    [source, validationChain]
  );
  const currentEligibility = useMemo(() => buildPaperDemoEligibility(currentCandidate), [currentCandidate]);
  const checklist = latestPaperDemoDailyChecklist(state);
  const selectedCandidate =
    state.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? state.candidates[0] ?? currentCandidate;
  const report = useMemo(() => buildPaperDemoReport(state), [state]);
  const reportText = useMemo(() => formatPaperDemoReport(report), [report]);

  const refreshState = (next: PaperDemoOperationsState) => setState(next);

  const runPaperDemoAutoCycle = async () => {
    if (autoCycleBusy) return;
    setAutoCycleBusy(true);
    try {
      await runAutoPaperDemoCycle({ persist: true, createWatchlistCandidate: true });
      setAutoCycleState(loadAutoPaperDemoCycleState());
      setState(loadPaperDemoOperationsState());
    } finally {
      setAutoCycleBusy(false);
    }
  };

  const stopPaperDemoAutoCycle = () => {
    setAutoCycleState(stopAutoPaperDemoCycle("Stopped from Paper-Demo Operations."));
  };

  const addCurrentCandidateToWatchlist = () => {
    const nextCandidate = toPaperDemoWatchlistStatus(currentCandidate);
    refreshState(upsertPaperDemoCandidate(nextCandidate));
    setSelectedCandidateId(nextCandidate.id);
    setActiveTab(nextCandidate.status === "watchlist" ? "watchlist" : "detail");
  };

  const updateStatus = (candidateId: string, status: PaperDemoCandidateStatus) => {
    refreshState(updatePaperDemoCandidateStatus(candidateId, status));
    setSelectedCandidateId(candidateId);
  };

  const addCandidateNote = () => {
    const trimmed = candidateNote.trim();
    if (!trimmed) return;
    const candidate = selectedCandidate;
    refreshState(
      upsertPaperDemoCandidate({
        ...candidate,
        operatorNotes: [trimmed, ...candidate.operatorNotes].slice(0, 20),
        updatedAt: nowIso(),
        authority: PAPER_DEMO_AUTHORITY,
        executionIntent: "none"
      })
    );
    setCandidateNote("");
  };

  const toggleChecklistItem = (itemId: string) => {
    const nextChecklist: PaperDemoDailyChecklist = {
      ...checklist,
      updatedAt: nowIso(),
      items: checklist.items.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)),
      authority: PAPER_DEMO_AUTHORITY
    };
    refreshState(savePaperDemoDailyChecklist(nextChecklist));
  };

  const submitJournal = () => {
    if (!journalForm.observation.trim()) return;
    const entry = {
      id: `paper_demo_journal_${Date.now().toString(36)}`,
      createdAt: nowIso(),
      symbol: journalForm.symbol.trim() || currentCandidate.requestedSymbol,
      setup: journalForm.setup.trim() || currentCandidate.setupName,
      observation: journalForm.observation.trim().slice(0, 800),
      watchedCondition: journalForm.watchedCondition.trim().slice(0, 500),
      invalidation: journalForm.invalidation.trim().slice(0, 500),
      evidenceNeeded: journalForm.evidenceNeeded.trim().slice(0, 500),
      operatorConfidence: journalForm.operatorConfidence,
      researchOnly: true as const,
      authority: PAPER_DEMO_AUTHORITY
    };
    refreshState(appendPaperDemoSessionJournalEntry(entry));
    setJournalForm((form) => ({ ...form, observation: "", watchedCondition: "", invalidation: "", evidenceNeeded: "" }));
    setActiveTab("journal");
  };

  return (
    <div className={WORKSPACE_PAGE}>
      <PageHeader
        eyebrow="Validate / Paper-Demo Operations"
        title="Paper-Demo Operations"
        description="Manual research-only operations for validated candidates. This workspace organizes watchlists, checklists, notes, and compact reports. It does not connect to a broker or place orders."
        badges={
          <>
            <Badge variant="danger">Execution disabled</Badge>
            <Badge variant="secondary">Authority none</Badge>
            <Badge variant="warning">Manual operations only</Badge>
          </>
        }
      />

      <SourceStatusBanner />
      <ValidationChainCard testId="paper-demo-validation-chain" />

      <nav
        data-testid="paper-demo-tabs"
        aria-label="Paper-Demo Operations tabs"
        className={WORKSPACE_TABS}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              activeTab === tab.id ? "border border-white/10 bg-white/[0.10] text-slate-50 shadow-sm" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            )}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <PaperDemoOverview
          candidate={currentCandidate}
          eligibility={currentEligibility}
          onAdd={addCurrentCandidateToWatchlist}
          state={state}
        />
      ) : null}
      {activeTab === "watchlist" ? (
        <PaperDemoWatchlist candidates={state.candidates} onSelect={setSelectedCandidateId} onStatus={updateStatus} />
      ) : null}
      {activeTab === "auto" ? (
        <PaperDemoAutoCyclePanel
          state={autoCycleState}
          busy={autoCycleBusy}
          onRun={runPaperDemoAutoCycle}
          onStop={stopPaperDemoAutoCycle}
        />
      ) : null}
      {activeTab === "checklist" ? <PaperDemoDailyChecklistView checklist={checklist} onToggle={toggleChecklistItem} /> : null}
      {activeTab === "detail" ? (
        <PaperDemoCandidateDetail
          candidate={selectedCandidate}
          note={candidateNote}
          onNoteChange={setCandidateNote}
          onAddNote={addCandidateNote}
          onStatus={updateStatus}
        />
      ) : null}
      {activeTab === "journal" ? (
        <PaperDemoJournal
          form={journalForm}
          journalEntries={state.journalEntries}
          onChange={setJournalForm}
          onSubmit={submitJournal}
        />
      ) : null}
      {activeTab === "export" ? <PaperDemoExport report={report} reportText={reportText} /> : null}
    </div>
  );
}

function PaperDemoAutoCyclePanel({
  busy,
  onRun,
  onStop,
  state
}: {
  busy: boolean;
  onRun: () => Promise<void>;
  onStop: () => void;
  state: AutoPaperDemoCycleState;
}) {
  const latest = state.latestCycle;
  const blockers = latest?.blockers ?? [];
  const report = latest?.dailyReport;
  return (
    <section data-testid="paper-demo-auto-cycle-panel" className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={WORKSPACE_SECTION_LABEL}>Auto Paper-Demo Cycle</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-50">{formatToken(latest?.currentStage ?? "idle")}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Research workflow automation only. Recognition can be queued into validation, but replay, walk-forward, and evidence advance only from safe deterministic summaries.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={busy ? "warning" : blockers.length ? "warning" : "secondary"}>
              {busy ? "running" : formatToken(latest?.status ?? "idle")}
            </Badge>
            <Badge variant="danger">authority none</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Readout label="Recognition" value={latest?.recognitionSummary?.setupLabel ?? "none queued"} detail={latest?.recognitionSummary?.recognitionType} />
          <Readout label="Validation chain" value={latest?.validationChainId ?? "none"} detail={latest?.replaySummary?.verdict ? `replay ${latest.replaySummary.verdict}` : "replay queued only"} />
          <Readout label="Watchlist candidate" value={latest?.watchlistCandidateId ?? "none"} detail="created only if all gates pass" />
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-slate-100">Next action</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {latest?.nextAction ?? "Run cycle now to evaluate the active research source and queue validation."}
          </p>
          {blockers.length ? (
            <ul className="mt-3 space-y-1 text-sm text-amber-100">
              {blockers.slice(0, 6).map((blocker) => (
                <li key={blocker}>- {blocker}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void onRun()} disabled={busy}>{busy ? "Running..." : "Run cycle now"}</Button>
          <Button variant="secondary" onClick={onStop}>Stop cycle</Button>
          <Button variant="secondary">
            <Link to="/advisor" className="inline-flex items-center gap-2">
              Open Advisor <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="secondary">
            <Link to="/validation" className="inline-flex items-center gap-2">
              Open validation chain <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <p className={WORKSPACE_SECTION_LABEL}>Daily report</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-50">{report?.date ?? "No report yet"}</h3>
        <div className="mt-4 grid gap-3">
          <Readout label="Source" value={report?.sourceStatus.sourceProvider ?? "pending"} detail={report ? `${report.sourceStatus.requestedSymbol} / ${report.sourceStatus.brokerSymbol ?? "no broker"} / ${report.sourceStatus.candleCount.toLocaleString()} candles` : "activate source first"} />
          <Readout label="Replay / Walk-forward" value={`${report?.replayStatus ?? "pending"} / ${report?.walkForwardStatus ?? "pending"}`} />
          <Readout label="Evidence / maturity" value={report?.evidenceMaturityStatus ?? "pending"} />
          <Readout label="Checklist" value={report ? `${report.checklistStatus.completed}/${report.checklistStatus.total} complete` : "pending"} />
        </div>
        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-100">
          <ShieldCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />
          {report?.disclaimer ?? "Research-only manual paper-demo operations. No broker execution."}
        </div>
      </div>
    </section>
  );
}

function PaperDemoOverview({
  candidate,
  eligibility,
  onAdd,
  state
}: {
  candidate: PaperDemoCandidate;
  eligibility: ReturnType<typeof buildPaperDemoEligibility>;
  onAdd: () => void;
  state: PaperDemoOperationsState;
}) {
  const monitoring = state.candidates.filter((item) => item.status === "monitoring").length;
  const blocked = state.candidates.filter((item) => item.status === "blocked").length;
  return (
    <section data-testid="paper-demo-overview" className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={WORKSPACE_SECTION_LABEL}>Current candidate gate</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-50">{candidate.setupName}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {candidate.requestedSymbol} {candidate.timeframe}
              {candidate.brokerSymbol ? ` via ${candidate.brokerSymbol}` : ""} / {formatToken(candidate.recognitionType)}
            </p>
          </div>
          <Badge variant={statusVariant(eligibility.status)}>{formatToken(eligibility.status)}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Readout label="Replay" value={formatToken(String(candidate.replayStatus))} />
          <Readout label="Walk-forward" value={formatToken(String(candidate.walkForwardStatus))} />
          <Readout label="Evidence / maturity" value={`${formatToken(String(candidate.evidenceStatus))} / ${formatToken(String(candidate.maturityStatus))}`} />
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-slate-100">Next action</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{eligibility.nextAction}</p>
          {eligibility.blockers.length ? (
            <ul className="mt-3 space-y-1 text-sm text-rose-100">
              {eligibility.blockers.slice(0, 5).map((blocker) => (
                <li key={blocker}>- {blocker}</li>
              ))}
            </ul>
          ) : null}
          {eligibility.warnings.length ? (
            <ul className="mt-3 space-y-1 text-sm text-amber-100">
              {eligibility.warnings.slice(0, 3).map((warning) => (
                <li key={warning}>- {warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onAdd} disabled={!eligibility.eligible}>
            Add to watchlist
          </Button>
          <Button variant="secondary">
            <Link to="/advisor" className="inline-flex items-center gap-2">
              Open Advisor <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="secondary">
            <Link to="/validation" className="inline-flex items-center gap-2">
              Open validation chain <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <p className={WORKSPACE_SECTION_LABEL}>Operations counts</p>
        <div className="mt-4 grid gap-3">
          <Readout label="Total candidates" value={String(state.candidates.length)} />
          <Readout label="Monitoring" value={String(monitoring)} />
          <Readout label="Blocked" value={String(blocked)} />
        </div>
        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-100">
          <ShieldCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Manual paper-demo operations only. No order buttons, no broker paper trading, no readiness override.
        </div>
      </div>
    </section>
  );
}

function PaperDemoWatchlist({
  candidates,
  onSelect,
  onStatus
}: {
  candidates: PaperDemoCandidate[];
  onSelect: (id: string) => void;
  onStatus: (id: string, status: PaperDemoCandidateStatus) => void;
}) {
  const visible = candidates.filter((candidate) => candidate.status !== "draft");
  return (
    <section data-testid="paper-demo-watchlist" className={cn(WORKSPACE_CARD, "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={WORKSPACE_SECTION_LABEL}>Watchlist</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Candidate watchlist</h3>
        </div>
        <Badge variant="secondary">{visible.length} saved</Badge>
      </div>
      {visible.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="py-2 pr-4">Setup</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Validation</th>
                <th className="py-2 pr-4">Evidence</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visible.map((candidate) => (
                <tr key={candidate.id} className="align-top">
                  <td className="py-3 pr-4">
                    <button className="text-left font-semibold text-cyan-100" type="button" onClick={() => onSelect(candidate.id)}>
                      {candidate.setupName}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">{formatToken(String(candidate.recognitionType))}</p>
                  </td>
                  <td className="py-3 pr-4 text-slate-300">
                    {candidate.requestedSymbol} / {candidate.brokerSymbol ?? "no broker"} / {candidate.timeframe}
                  </td>
                  <td className="py-3 pr-4 text-slate-300">
                    Replay {formatToken(String(candidate.replayStatus))}
                    <br />
                    Walk-forward {formatToken(String(candidate.walkForwardStatus))}
                  </td>
                  <td className="py-3 pr-4 text-slate-300">
                    {formatToken(String(candidate.evidenceStatus))} / {formatToken(String(candidate.maturityStatus))}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={statusVariant(candidate.status)}>{formatToken(candidate.status)}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onStatus(candidate.id, "monitoring")}>Mark monitoring</Button>
                      <Button size="sm" variant="secondary" onClick={() => onStatus(candidate.id, "blocked")}>Mark blocked</Button>
                      <Button size="sm" variant="secondary" onClick={() => onStatus(candidate.id, "retired")}>Retire candidate</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <WorkspaceEmptyState
          title="No watchlist candidates yet"
          message="A candidate can enter the watchlist only after source, validation, replay, evidence, maturity, checklist, and authority checks pass."
          actionHref="/validation"
          actionLabel="Open validation"
        />
      )}
    </section>
  );
}

function PaperDemoDailyChecklistView({
  checklist,
  onToggle
}: {
  checklist: PaperDemoDailyChecklist;
  onToggle: (id: string) => void;
}) {
  const completed = checklist.items.filter((item) => item.completed).length;
  return (
    <section data-testid="paper-demo-daily-checklist" className={cn(WORKSPACE_CARD, "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={WORKSPACE_SECTION_LABEL}>Daily checklist</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Manual operator review</h3>
          <p className="mt-2 text-sm text-slate-400">Completion state is stored locally. This checklist cannot promote readiness.</p>
        </div>
        <Badge variant={completed === checklist.items.length ? "success" : "warning"}>
          {completed}/{checklist.items.length} complete
        </Badge>
      </div>
      <div className="mt-4 grid gap-2">
        {checklist.items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => onToggle(item.id)}
              className="mt-1 h-4 w-4 accent-cyan-300"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-100">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function PaperDemoCandidateDetail({
  candidate,
  note,
  onAddNote,
  onNoteChange,
  onStatus
}: {
  candidate: PaperDemoCandidate;
  note: string;
  onAddNote: () => void;
  onNoteChange: (value: string) => void;
  onStatus: (id: string, status: PaperDemoCandidateStatus) => void;
}) {
  return (
    <section data-testid="paper-demo-candidate-detail" className={cn(WORKSPACE_CARD, "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={WORKSPACE_SECTION_LABEL}>Candidate detail</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">{candidate.setupName}</h3>
          <p className="mt-2 text-sm text-slate-400">
            {candidate.requestedSymbol} / {candidate.brokerSymbol ?? "no broker symbol"} / {candidate.timeframe}
          </p>
        </div>
        <Badge variant={statusVariant(candidate.status)}>{formatToken(candidate.status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Readout label="Source" value={formatToken(candidate.sourceProvider)} detail={candidate.sourceFingerprint} />
        <Readout label="Validation chain" value={candidate.validationChainId ?? "missing"} />
        <Readout label="Authority" value={`${candidate.authority.executionAuthority}/${candidate.authority.brokerAuthority}/${candidate.authority.readinessOverrideAuthority}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListCard title="Blockers" values={candidate.blockers} empty="No blockers recorded." tone="danger" />
        <ListCard title="Operator notes" values={candidate.operatorNotes} empty="No operator notes yet." />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <Textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Add a compact operator note. No trade/order fields." />
        <Button onClick={onAddNote} disabled={!note.trim()}>Add note</Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onStatus(candidate.id, "monitoring")}>Mark monitoring</Button>
        <Button size="sm" variant="secondary" onClick={() => onStatus(candidate.id, "blocked")}>Mark blocked</Button>
        <Button size="sm" variant="secondary" onClick={() => onStatus(candidate.id, "retired")}>Retire candidate</Button>
        <Button size="sm" variant="secondary">
          <Link to="/evidence-quality">Open Evidence</Link>
        </Button>
        <Button size="sm" variant="secondary">
          <Link to="/walk-forward">Open Walk-Forward</Link>
        </Button>
      </div>
    </section>
  );
}

function PaperDemoJournal({
  form,
  journalEntries,
  onChange,
  onSubmit
}: {
  form: PaperDemoJournalForm;
  journalEntries: Array<{ id: string; createdAt: string; symbol: string; setup: string; observation: string; operatorConfidence: string }>;
  onChange: (value: PaperDemoJournalForm) => void;
  onSubmit: () => void;
}) {
  return (
    <section data-testid="paper-demo-session-journal" className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <p className={WORKSPACE_SECTION_LABEL}>Session Journal</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-50">Manual research note</h3>
        <div className="mt-4 grid gap-3">
          <Input value={form.symbol} onChange={(event) => onChange({ ...form, symbol: event.target.value })} placeholder="Symbol" />
          <Input value={form.setup} onChange={(event) => onChange({ ...form, setup: event.target.value })} placeholder="Setup" />
          <Textarea value={form.observation} onChange={(event) => onChange({ ...form, observation: event.target.value })} placeholder="Observation" />
          <Textarea value={form.watchedCondition} onChange={(event) => onChange({ ...form, watchedCondition: event.target.value })} placeholder="What would be watched" />
          <Textarea value={form.invalidation} onChange={(event) => onChange({ ...form, invalidation: event.target.value })} placeholder="What invalidates this research setup" />
          <Textarea value={form.evidenceNeeded} onChange={(event) => onChange({ ...form, evidenceNeeded: event.target.value })} placeholder="Evidence still needed" />
          <Select
            value={form.operatorConfidence}
            onChange={(event) => onChange({ ...form, operatorConfidence: event.target.value as "low" | "medium" | "high" })}
            options={[
              { label: "low confidence", value: "low" },
              { label: "medium confidence", value: "medium" },
              { label: "high confidence", value: "high" }
            ]}
          />
          <Button onClick={onSubmit} disabled={!form.observation.trim()}>Add journal note</Button>
        </div>
      </div>
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <p className={WORKSPACE_SECTION_LABEL}>Recent notes</p>
        <div className="mt-4 space-y-3">
          {journalEntries.length ? (
            journalEntries.slice(0, 12).map((entry) => (
              <article key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{entry.symbol} / {entry.setup}</p>
                  <Badge variant="secondary">{entry.operatorConfidence}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{entry.observation}</p>
                <p className="mt-2 text-xs text-slate-600">{new Date(entry.createdAt).toLocaleString()}</p>
              </article>
            ))
          ) : (
            <WorkspaceEmptyState title="No journal entries" message="Add manual research notes during a monitored session. Do not record trade/order fields." />
          )}
        </div>
      </div>
    </section>
  );
}

function PaperDemoExport({ report, reportText }: { report: ReturnType<typeof buildPaperDemoReport>; reportText: string }) {
  return (
    <section data-testid="paper-demo-export-report" className="grid gap-4 lg:grid-cols-2">
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <div className="flex items-start gap-3">
          <FileText className="mt-1 h-5 w-5 text-cyan-200" aria-hidden="true" />
          <div>
            <p className={WORKSPACE_SECTION_LABEL}>Export / Report</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-50">Compact text summary</h3>
          </div>
        </div>
        <Textarea className="mt-4 min-h-[360px] font-mono text-xs" value={reportText} readOnly />
      </div>
      <div className={cn(WORKSPACE_CARD, "p-5")}>
        <div className="flex items-start gap-3">
          <NotebookPen className="mt-1 h-5 w-5 text-violet-200" aria-hidden="true" />
          <div>
            <p className={WORKSPACE_SECTION_LABEL}>Compact JSON</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-50">Report object</h3>
          </div>
        </div>
        <Textarea className="mt-4 min-h-[360px] font-mono text-xs" value={JSON.stringify(report, null, 2)} readOnly />
      </div>
    </section>
  );
}

function Readout({ detail, label, value }: { detail?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-100">{value}</p>
      {detail ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function ListCard({
  empty,
  title,
  tone = "muted",
  values
}: {
  empty: string;
  title: string;
  tone?: "muted" | "danger";
  values: string[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <ul className={cn("mt-3 space-y-1 text-sm leading-6", tone === "danger" ? "text-rose-100" : "text-slate-400")}>
        {values.length ? values.slice(0, 8).map((value) => <li key={value}>- {value}</li>) : <li>{empty}</li>}
      </ul>
    </div>
  );
}
