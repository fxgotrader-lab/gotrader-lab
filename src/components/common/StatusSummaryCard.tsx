import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type StatusTone = "default" | "secondary" | "success" | "warning" | "danger" | "muted";

type StatusSummaryCardProps = {
  detail?: ReactNode;
  icon?: LucideIcon;
  label: string;
  status?: string;
  tone?: StatusTone;
  value: ReactNode;
};

export function StatusSummaryCard({
  detail,
  icon: Icon,
  label,
  status,
  tone = "secondary",
  value,
}: StatusSummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex min-h-28 flex-col justify-between gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          {Icon ? <Icon className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
        </div>
        <div>
          <div className="text-2xl font-semibold tracking-normal">{value}</div>
          {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
        </div>
        {status ? (
          <Badge variant={tone === "default" ? "default" : tone} className="w-fit">
            {status}
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
