import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, ShieldCheck, XCircle } from "lucide-react";

import { ValidationChainCard } from "@/components/common/ValidationChainCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dismissOpenClawPilotDraft,
  latestBlockedOpenClawPilotDraft,
  latestOpenClawPilotDraft,
  loadOpenClawPilotDraftState,
  markOpenClawPilotDraftQueued,
  OPENCLAW_PILOT_DRAFTS_UPDATED_EVENT,
  openClawPilotProgram
} from "@/lib/openclawPilot";
import type { OpenClawPilotDraftState, OpenClawPilotProposalDraft } from "@/lib/openclawPilot";

const formatToken = (value?: string) => (value?.trim() ? value.replace(/_/g, " ") : "none");
const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "none");

const statusVariant = (status?: string) =>
  status === "safe_draft" || status === "queued_for_deterministic_validation"
    ? "success"
    : status === "blocked"
      ? "danger"
      : "warning";

export function useOpenClawPilotDraftState() {
  const [state, setState] = useState<OpenClawPilotDraftState>(() => loadOpenClawPilotDraftState());

  useEffect(() => {
    const refresh = () => setState(loadOpenClawPilotDraftState());
    window.addEventListener(OPENCLAW_PILOT_DRAFTS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(OPENCLAW_PILOT_DRAFTS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return state;
}

export function OpenClawProposalIntentPanel({
  context = "advisor",
  showValidationChain = false,
  showDismiss = false,
  testId = "openclaw-proposal-intent-panel"
}: {
  context?: "advisor" | "self_improvement" | "card";
  showValidationChain?: boolean;
  showDismiss?: boolean;
  testId?: string;
}) {
  const state = useOpenClawPilotDraftState();
  const safeDraft = useMemo(() => latestOpenClawPilotDraft(state), [state]);
  const blockedDraft = useMemo(() => latestBlockedOpenClawPilotDraft(state), [state]);
  const program = openClawPilotProgram;
  const title = context === "self_improvement" ? "OpenClaw Pilot Drafts" : "Proposal Intent";

  const queueDraft = (draftId: string) => {
    markOpenClawPilotDraftQueued(draftId);
  };
  const dismissDraft = (draftId: string) => {
    dismissOpenClawPilotDraft(draftId);
  };

  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-cyan-300/15 bg-slate-950/60 p-4 text-sm text-slate-300 shadow-[0_0_32px_rgba(8,145,178,0.07)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <h3 className="text-base font-semibold text-slate-50">{title}</h3>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Draft only - GoTrader must validate before progression. No calibration is applied, no readiness is approved,
            and no execution intent is created.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">program v{program.version}</Badge>
          <Badge variant="danger" data-testid="openclaw-pilot-draft-authority">authority none</Badge>
          <Badge variant="warning" data-testid="openclaw-pilot-draft-auto-apply">autoApplyAllowed false</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {safeDraft ? (
          <DraftCard
            draft={safeDraft}
            label="Latest safe draft"
            testId="openclaw-pilot-safe-draft"
            onQueue={queueDraft}
            onDismiss={showDismiss ? dismissDraft : undefined}
          />
        ) : (
          <div
            data-testid="openclaw-pilot-no-draft"
            className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400"
          >
            No active OpenClaw pilot drafts yet. Ask OpenClaw for a calibration or next-test suggestion, then GoTrader
            will dry-run validate the returned proposal intent.
          </div>
        )}

        {blockedDraft ? (
          <DraftCard
            draft={blockedDraft}
            label="Latest blocked intent"
            testId="openclaw-pilot-blocked-draft"
            onDismiss={showDismiss ? dismissDraft : undefined}
          />
        ) : (
          <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs leading-5 text-emerald-100/80">
            <div className="flex items-center gap-2 font-medium text-emerald-100">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              No unsafe OpenClaw proposal intent is currently stored.
            </div>
            <p className="mt-2">Blocked intents are retained as compact audit records when dry-run validation rejects them.</p>
          </div>
        )}
      </div>

      {safeDraft ? (
        <div className="mt-4 grid gap-2 text-xs md:grid-cols-3">
          <Readout label="Validation chain" value={safeDraft.validationChainId ?? "validation required"} />
          <Readout label="Replay" value={safeDraft.requiresReplay ? "required" : "not requested"} />
          <Readout label="Walk-forward" value={safeDraft.requiresWalkForward ? "required" : "not requested"} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {safeDraft ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => queueDraft(safeDraft.id)}
            disabled={safeDraft.validationStatus === "blocked"}
          >
            Queue deterministic validation
          </Button>
        ) : null}
        {context !== "self_improvement" ? (
          <Link
            to="/self-improvement"
            className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
          >
            Open Self-Improvement
          </Link>
        ) : null}
        {context !== "advisor" ? (
          <Link
            to="/advisor"
            className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
          >
            Review validation chain
          </Link>
        ) : null}
      </div>

      {showValidationChain ? (
        <div className="mt-4">
          <ValidationChainCard testId="openclaw-pilot-validation-chain" />
        </div>
      ) : null}
    </section>
  );
}

function DraftCard({
  draft,
  label,
  testId,
  onQueue,
  onDismiss
}: {
  draft: OpenClawPilotProposalDraft;
  label: string;
  testId: string;
  onQueue?: (draftId: string) => void;
  onDismiss?: (draftId: string) => void;
}) {
  const blocked = draft.validationStatus === "blocked";

  return (
    <article
      data-testid={testId}
      className={`rounded-xl border p-3 ${
        blocked ? "border-red-300/25 bg-red-300/10 text-red-50" : "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.14em] opacity-70">{label}</p>
          <h4 className="mt-1 break-words text-base font-semibold">{draft.proposalTitle}</h4>
        </div>
        <Badge variant={statusVariant(draft.validationStatus)} data-testid="openclaw-pilot-draft-validation-status">
          {formatToken(draft.validationStatus)}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 opacity-80">{draft.compactSummary}</p>
      {draft.blockedReason ? (
        <div className="mt-3 rounded-lg border border-red-200/20 bg-black/20 p-2 text-xs leading-5">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{draft.blockedReason}</span>
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <Readout label="Target subsystem" value={draft.targetSubsystem} />
        <Readout label="Candidate families" value={draft.candidateFamilies.join(", ") || "none"} />
        <Readout label="Strategy ID" value={draft.strategyId ?? "not mapped"} />
        <Readout label="Strategy family" value={draft.strategyFamily ?? "not supplied"} />
        <Readout label="Source" value={[draft.sourceProvider, draft.requestedSymbol, draft.brokerSymbol].filter(Boolean).join(" / ") || "unknown"} />
        <Readout label="Source fingerprint" value={draft.sourceFingerprint ?? "unknown"} />
        <Readout label="Created" value={formatDate(draft.timestamp)} />
        <Readout label="Next action" value={draft.nextAction} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="danger">executionAuthority none</Badge>
        <Badge variant="danger">brokerAuthority none</Badge>
        <Badge variant="danger">readinessOverrideAuthority none</Badge>
        <Badge variant="warning">draft only</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onQueue && !blocked ? (
          <Button size="sm" variant="secondary" onClick={() => onQueue(draft.id)}>
            Queue deterministic validation
          </Button>
        ) : null}
        {onDismiss ? (
          <Button size="sm" variant="outline" onClick={() => onDismiss(draft.id)}>
            Dismiss draft
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-2">
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 line-clamp-3 break-words text-xs font-medium text-slate-100">{value}</p>
    </div>
  );
}
