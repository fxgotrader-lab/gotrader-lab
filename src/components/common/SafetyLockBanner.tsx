import { Lock, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SafetyLockBannerProps = {
  className?: string;
  message?: string;
};

export function SafetyLockBanner({
  className,
  message = "Simulation research only. Broker execution, live trading, readiness override, and order placement remain disabled.",
}: SafetyLockBannerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
      <Badge variant="success" className="w-fit">
        <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
        safety locks on
      </Badge>
    </div>
  );
}
