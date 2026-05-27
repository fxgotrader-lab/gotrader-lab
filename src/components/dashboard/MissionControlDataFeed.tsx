import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

export type MissionFeedItem = {
  detail: string;
  href?: string;
  id: string;
  severity: "info" | "warning" | "critical" | "action_required";
  timestamp?: string;
  title: string;
};

const severityVariant = (severity: MissionFeedItem["severity"]) =>
  severity === "critical"
    ? "danger"
    : severity === "warning" || severity === "action_required"
      ? "warning"
      : "secondary";

const formatTime = (timestamp?: string) => {
  if (!timestamp) {
    return "pending";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
};

export function MissionControlDataFeed({ items }: { items: MissionFeedItem[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Live feed</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-50">Research Events</h3>
        </div>
        <Badge variant="secondary">{items.length} latest</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item) => {
            const row = (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:border-cyan-300/25">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-slate-500">{formatTime(item.timestamp)}</span>
                    <Badge variant={severityVariant(item.severity)}>{item.severity.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              </div>
            );
            return item.href ? (
              <Link key={item.id} to={item.href} className="block">
                {row}
              </Link>
            ) : (
              <div key={item.id}>{row}</div>
            );
          })
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
            No loop events yet. Start the autonomous research loop to populate the feed.
          </div>
        )}
      </div>
    </section>
  );
}
