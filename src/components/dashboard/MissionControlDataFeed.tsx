import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

export type MissionFeedItem = {
  detail: string;
  href?: string;
  id: string;
  severity: "info" | "warning" | "critical" | "action_required" | "success" | "failed" | "running" | "locked";
  sourceFingerprint?: string;
  timestamp?: string;
  title: string;
};

const severityVariant = (severity: MissionFeedItem["severity"]) =>
  severity === "critical" || severity === "failed"
    ? "danger"
    : severity === "warning" || severity === "action_required"
      ? "warning"
      : severity === "success"
        ? "success"
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
    <section className="rounded-xl border border-cyan-300/15 bg-slate-950/90 p-4 shadow-[0_0_40px_rgba(8,145,178,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Research flow tape</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-50">Live Research Ledger</h3>
        </div>
        <Badge variant="secondary">{items.length} latest</Badge>
      </div>
      <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {items.length ? (
          items.map((item) => {
            const row = (
              <div
                className={`relative rounded-lg border border-white/10 bg-white/[0.03] p-3 pl-4 transition hover:border-cyan-300/25 ${
                  item.severity === "running" ? "shadow-[0_0_18px_rgba(34,211,238,0.12)]" : ""
                }`}
              >
                <span
                  className={`absolute left-0 top-3 h-[calc(100%-1.5rem)] w-1 rounded-r-full ${
                    item.severity === "success"
                      ? "bg-emerald-300"
                      : item.severity === "warning" || item.severity === "action_required"
                        ? "bg-amber-300"
                        : item.severity === "critical" || item.severity === "failed"
                          ? "bg-rose-300"
                          : item.severity === "running"
                            ? "animate-pulse bg-cyan-300"
                            : item.severity === "locked"
                              ? "bg-slate-500"
                              : "bg-cyan-700"
                  }`}
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                    {item.sourceFingerprint ? (
                      <p className="mt-1 break-all font-mono text-[0.65rem] uppercase tracking-[0.08em] text-slate-500">
                        {item.sourceFingerprint}
                      </p>
                    ) : null}
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
            No research events yet. Connect data or start the autonomous research loop to populate the tape.
          </div>
        )}
      </div>
      <div className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs text-cyan-100/75">
        Future OpenClaw memory and Hermes notification hooks can mirror these research events, but they remain advisory/notification only with no execution authority.
      </div>
    </section>
  );
}
