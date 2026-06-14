import { useEffect, useState } from "react";
import { RadioTower, ShieldCheck, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { WORKSPACE_SECTION_LABEL } from "@/components/common/workspaceStyles";
import {
  loadMt5PushFeedStatusSnapshot,
  MT5_PUSH_FEED_STATUS_UPDATED_EVENT,
  type Mt5PushFeedStatusSnapshot
} from "@/lib/mt5PushFeed";

const formatDateTime = (value?: string) => {
  if (!value) {
    return "waiting";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const statusTone = (status: Mt5PushFeedStatusSnapshot["status"]) =>
  status === "connected" ? "success" as const : status === "stale" || status === "degraded" ? "warning" as const : status === "error" ? "danger" as const : "secondary" as const;

export function useMt5PushFeedStatusSnapshot() {
  const [snapshot, setSnapshot] = useState<Mt5PushFeedStatusSnapshot>(() => loadMt5PushFeedStatusSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(loadMt5PushFeedStatusSnapshot());
    window.addEventListener(MT5_PUSH_FEED_STATUS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MT5_PUSH_FEED_STATUS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return snapshot;
}

export function Mt5PushFeedStatusCard({ className = "" }: { className?: string }) {
  const snapshot = useMt5PushFeedStatusSnapshot();

  return (
    <section
      data-testid="mt5-push-feed-status-card"
      className={`premium-surface-soft rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={WORKSPACE_SECTION_LABEL}>MT5 feed status</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RadioTower className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-slate-50">Push feed</h3>
            <Badge variant={statusTone(snapshot.status)}>{snapshot.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>
        <Badge variant="muted">Source: MT5 push feed</Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <FeedMetric label="Last event" value={formatDateTime(snapshot.lastEventAt)} />
        <FeedMetric label="Last candle" value={snapshot.lastCandleTimestamp ? formatDateTime(snapshot.lastCandleTimestamp) : "waiting"} />
        <FeedMetric label="Symbols" value={snapshot.activeSymbols.length ? snapshot.activeSymbols.join(", ") : "none"} />
        <FeedMetric label="Timeframes" value={snapshot.activeTimeframes.length ? snapshot.activeTimeframes.join(", ") : "none"} />
      </div>

      {snapshot.staleFeedWarning ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-100" role="alert">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{snapshot.staleFeedWarning}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>Events {snapshot.processedEventCount.toLocaleString()}</span>
        <span>Duplicates skipped {snapshot.skippedDuplicateCount.toLocaleString()}</span>
        <span>Ignored {snapshot.ignoredEventCount.toLocaleString()}</span>
        <span className="inline-flex items-center gap-1 text-emerald-100/80">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          execution none / broker read-only / readiness none
        </span>
      </div>
    </section>
  );
}

function FeedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-slate-100">{value}</div>
    </div>
  );
}
