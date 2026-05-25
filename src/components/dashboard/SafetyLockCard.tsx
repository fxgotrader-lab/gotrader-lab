import { KeyRound, Lock, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const locks = [
  "Broker execution disabled",
  "Live trading disabled",
  "Readiness override disabled",
  "LLM execution authority none",
  "API keys not stored in browser",
];

export function SafetyLockCard() {
  return (
    <Card className="border-emerald-400/20 bg-emerald-950/20">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-emerald-100">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Safety Locks
          </CardTitle>
          <p className="mt-1 text-xs text-emerald-200/70">Always-on restrictions for this frontend cockpit.</p>
        </div>
        <Badge variant="success">Locked</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {locks.map((lock, index) => {
            const Icon = index === 4 ? KeyRound : Lock;

            return (
              <div key={lock} className="flex min-h-16 items-center gap-3 rounded-md border border-emerald-400/15 bg-emerald-400/5 p-3">
                <Icon className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span className="text-sm font-medium text-emerald-50">{lock}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
