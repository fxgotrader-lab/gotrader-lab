import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "default"
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold",
              tone === "positive" && "text-emerald-300",
              tone === "warning" && "text-amber-200",
              tone === "danger" && "text-rose-200"
            )}
          >
            {value}
          </p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        {icon ? <div className="rounded-md border border-border bg-secondary/60 p-2 text-muted-foreground">{icon}</div> : null}
      </CardContent>
    </Card>
  );
}
