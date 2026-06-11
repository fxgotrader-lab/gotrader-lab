import { Bot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLatestValidationChainEntry } from "@/components/common/ValidationChainCard";
import { latestBlockedOpenClawPilotDraft, latestOpenClawPilotDraft, openClawPilotProgram } from "@/lib/openclawPilot";
import { validationChainStatusLabel } from "@/lib/validationChain";
import { useOpenClawPilotDraftState } from "@/components/advisor/OpenClawProposalIntentPanel";

const formatToken = (value?: string) => (value?.trim() ? value : "unknown").replace(/_/g, " ");

/**
 * Compact OpenClaw pilot status card. The pilot is advisory/proposal-only:
 * auto-apply is disabled and all authority fields are locked to none.
 */
export function OpenClawPilotCard({ testId = "openclaw-pilot-card" }: { testId?: string }) {
  const program = openClawPilotProgram;
  const boundary = program.safetyBoundary;
  const chainEntry = useLatestValidationChainEntry();
  const draftState = useOpenClawPilotDraftState();
  const safeDraft = latestOpenClawPilotDraft(draftState);
  const blockedDraft = latestBlockedOpenClawPilotDraft(draftState);

  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-xs text-slate-300"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Bot className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">OpenClaw pilot</span>
        <Badge variant="secondary">Pilot mode: advisory/proposal-only</Badge>
        <Badge variant="muted" data-testid="openclaw-pilot-phase">
          {formatToken(program.phase)}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="danger" data-testid="openclaw-pilot-auto-apply">
          autoApplyAllowed: {String(boundary.autoApplyAllowed)}
        </Badge>
        <Badge variant="muted">executionAuthority: {boundary.authority.executionAuthority}</Badge>
        <Badge variant="muted">brokerAuthority: {boundary.authority.brokerAuthority}</Badge>
        <Badge variant="muted">readinessOverrideAuthority: {boundary.authority.readinessOverrideAuthority}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        {program.name} v{program.version}: {program.summary}
      </p>
      <p className="mt-1 text-xs text-slate-400" data-testid="openclaw-pilot-chain-status">
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Latest validation chain</span>{" "}
        {chainEntry
          ? `${chainEntry.setupLabel} · ${chainEntry.symbol} ${chainEntry.timeframe} · ${validationChainStatusLabel(chainEntry.hypothesisStatus)}`
          : "no recognition queued"}
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Latest draft</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-100">
            {safeDraft ? safeDraft.proposalTitle : "none"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Dry-run status</p>
          <p className="mt-1 text-xs font-medium text-slate-100">
            {safeDraft ? safeDraft.validationStatus.replace(/_/g, " ") : blockedDraft ? "blocked intent stored" : "no intent reviewed"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Blocked intent</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-100">
            {blockedDraft ? blockedDraft.blockedReason ?? blockedDraft.proposalTitle : "none"}
          </p>
        </div>
      </div>
    </section>
  );
}
