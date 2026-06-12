import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { WORKSPACE_SECTION_LABEL } from "@/components/common/workspaceStyles";

type PageHeaderProps = {
  badges?: ReactNode;
  className?: string;
  description: ReactNode;
  eyebrow: string;
  testId?: string;
  title: string;
};

/**
 * Unified workspace page header: eyebrow, title, description, optional badges.
 */
export function PageHeader({ badges, className, description, eyebrow, testId, title }: PageHeaderProps) {
  return (
    <header
      data-testid={testId ?? "workspace-page-header"}
      className={cn(
        "premium-surface premium-panel-grid flex min-w-0 flex-col justify-between gap-4 rounded-[24px] px-4 py-4 sm:px-5 md:flex-row md:items-end",
        className
      )}
    >
      <div className="min-w-0">
        <p className={WORKSPACE_SECTION_LABEL}>{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {badges ? <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">{badges}</div> : null}
    </header>
  );
}
