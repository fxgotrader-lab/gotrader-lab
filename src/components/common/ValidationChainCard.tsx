import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  describeValidationChainStage,
  latestValidationChainEntry,
  VALIDATION_CHAIN_UPDATED_EVENT,
  validationChainStatusLabel,
  type ValidationChainEntry,
  type ValidationChainHypothesisStatus
} from "@/lib/validationChain";

export function useLatestValidationChainEntry(): ValidationChainEntry | undefined {
  const [entry, setEntry] = useState<ValidationChainEntry | undefined>(() => latestValidationChainEntry());

  useEffect(() => {
    const refresh = () => setEntry(latestValidationChainEntry());
    window.addEventListener(VALIDATION_CHAIN_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(VALIDATION_CHAIN_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return entry;
}

const statusVariant = (status: ValidationChainHypothesisStatus) => {
  switch (status) {
    case "walk_forward_passed":
    case "evidence_updated":
      return "success" as const;
    case "replay_failed":
    case "walk_forward_failed":
    case "rejected":
      return "danger" as const;
    case "not_queued":
      return "muted" as const;
    default:
      return "warning" as const;
  }
};

const evidenceLabel = (entry: ValidationChainEntry): string => {
  if (entry.evidenceQuality) {
    const score = entry.evidenceQuality.evidenceQualityScore;
    return `Evidence updated${typeof score === "number" ? ` (quality ${score.toFixed(0)})` : ""}`;
  }
  if (entry.walkForwardResult?.verdict === "passed") {
    return "Walk-forward evidence recorded";
  }
  if (entry.replayResult?.verdict === "passed") {
    return "Preliminary replay evidence only";
  }
  return "No validated evidence yet";
};

/**
 * Compact recognition-to-validation chain summary. Recognition is never
 * evidence; this card shows where the latest recognition sits in the
 * replay -> walk-forward -> evidence chain and the safe next action.
 */
export function ValidationChainCard({
  className = "",
  testId = "validation-chain-card"
}: {
  className?: string;
  testId?: string;
}) {
  const entry = useLatestValidationChainEntry();

  if (!entry) {
    return (
      <section
        data-testid={testId}
        className={`rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-xs text-slate-400 ${className}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Validation chain</span>
          <Badge variant="muted" data-testid="validation-chain-status">
            no recognition queued
          </Badge>
          <Badge variant="muted">Authority: none</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Recognition is not evidence. Queue replay validation from a recognition card in the{" "}
          <Link to="/ict-lab" className="font-medium underline underline-offset-2">
            ICT Lab
          </Link>{" "}
          to start the replay → walk-forward → evidence chain.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid={testId}
      className={`rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-xs text-slate-300 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Validation chain</span>
        <Badge variant={statusVariant(entry.hypothesisStatus)} data-testid="validation-chain-status">
          {validationChainStatusLabel(entry.hypothesisStatus)}
        </Badge>
        <span className="font-mono text-xs text-slate-200">
          {entry.setupLabel} · {entry.symbol} {entry.timeframe}
        </span>
        <Badge variant="muted">Authority: none</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{describeValidationChainStage(entry)}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span data-testid="validation-chain-next-action">
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Next</span> {entry.nextAction}
        </span>
        <span data-testid="validation-chain-evidence">
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Evidence</span>{" "}
          {evidenceLabel(entry)}
        </span>
      </div>
      {entry.hypothesisStatus === "walk_forward_required" ? (
        <p className="mt-1 text-xs">
          <Link to="/walk-forward" className="font-medium text-sky-300 underline underline-offset-2">
            Open Walk-Forward to validate {entry.symbol} {entry.timeframe}
          </Link>
        </p>
      ) : null}
      {entry.hypothesisStatus === "replay_required" ? (
        <p className="mt-1 text-xs">
          <Link to="/advisor" className="font-medium text-sky-300 underline underline-offset-2">
            Run replay validation from the Advisor deep-research tools
          </Link>
        </p>
      ) : null}
    </section>
  );
}
