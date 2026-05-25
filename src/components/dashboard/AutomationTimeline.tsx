import { CheckCircle2, Clock3, ExternalLink, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { formatDateTime } from "./dashboardFormatters";

export type AutomationTimelineEvent = {
  detail: string;
  href: string;
  label: string;
  status: "complete" | "attention" | "missing";
  timestamp?: string;
};

type AutomationTimelineProps = {
  events: AutomationTimelineEvent[];
};

export function AutomationTimeline({ events }: AutomationTimelineProps) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader>
        <CardTitle className="text-base text-slate-100">Automation Timeline</CardTitle>
        <p className="text-xs text-slate-500">Latest research events across the simulation command loop.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={event.label} className="relative flex gap-3">
              {index < events.length - 1 ? <div className="absolute left-[9px] top-6 h-[calc(100%+0.5rem)] w-px bg-white/10" /> : null}
              <TimelineIcon status={event.status} />
              <div className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-100">{event.label}</div>
                  <Badge variant={event.status === "complete" ? "success" : event.status === "attention" ? "warning" : "secondary"}>
                    {event.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">{formatDateTime(event.timestamp)}</div>
                <p className="mt-2 text-sm text-slate-300">{event.detail}</p>
                <Link to={event.href}>
                  <Button variant="ghost" size="sm" className="mt-2 h-8 px-0 text-cyan-200 hover:px-2">
                    Open workflow
                    <ExternalLink className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineIcon({ status }: { status: AutomationTimelineEvent["status"] }) {
  const className =
    status === "complete" ? "text-emerald-300" : status === "attention" ? "text-amber-300" : "text-slate-500";

  if (status === "complete") {
    return <CheckCircle2 className={`relative z-10 mt-1 h-5 w-5 shrink-0 ${className}`} aria-hidden="true" />;
  }

  if (status === "attention") {
    return <Clock3 className={`relative z-10 mt-1 h-5 w-5 shrink-0 ${className}`} aria-hidden="true" />;
  }

  return <XCircle className={`relative z-10 mt-1 h-5 w-5 shrink-0 ${className}`} aria-hidden="true" />;
}
