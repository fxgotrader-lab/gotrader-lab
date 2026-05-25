import { FlaskConical, Lock, ServerOff, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusItems = [
  {
    label: "System Mode",
    value: "Research Mode",
    tone: "text-cyan-200",
    icon: FlaskConical,
  },
  {
    label: "Market Mode",
    value: "Simulation Mode",
    tone: "text-emerald-200",
    icon: ShieldCheck,
  },
  {
    label: "Broker Execution",
    value: "Disabled",
    tone: "text-amber-200",
    icon: ServerOff,
  },
  {
    label: "Live Trading",
    value: "Disabled",
    tone: "text-rose-200",
    icon: Lock,
  },
];

export function SystemStatusGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {statusItems.map((item) => {
        const Icon = item.icon;

        return (
          <Card key={item.label} className="border-white/10 bg-slate-950/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {item.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-semibold ${item.tone}`}>{item.value}</div>
              <Badge variant="secondary" className="mt-3 border-white/10 bg-white/5 text-slate-300">
                Research cockpit only
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
