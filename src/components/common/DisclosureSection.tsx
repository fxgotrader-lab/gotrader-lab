import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type DisclosureSectionProps = {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  description?: string;
  title: string;
};

export function DisclosureSection({
  children,
  className,
  defaultOpen = false,
  description,
  title,
}: DisclosureSectionProps) {
  return (
    <details
      className={cn(
        "group rounded-lg border border-border bg-card/55 shadow-sm transition-colors open:border-primary/25 open:bg-card/80",
        className
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {description ? <span className="mt-1 block text-xs text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border/70 p-4">{children}</div>
    </details>
  );
}
