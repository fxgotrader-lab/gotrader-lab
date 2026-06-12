import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Inbox, Loader2, ShieldAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WORKSPACE_CARD } from "@/components/common/workspaceStyles";

export type WorkspaceEmptyTone = "muted" | "warning" | "danger" | "loading";

type WorkspaceEmptyStateProps = {
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
  className?: string;
  message: ReactNode;
  testId?: string;
  title: string;
  tone?: WorkspaceEmptyTone;
};

const toneStyles: Record<WorkspaceEmptyTone, { border: string; icon: typeof Inbox; text: string }> = {
  muted: {
    border: "premium-surface-soft",
    icon: Inbox,
    text: "text-slate-300"
  },
  warning: {
    border: "border border-amber-300/25 bg-amber-300/10",
    icon: AlertTriangle,
    text: "text-amber-100"
  },
  danger: {
    border: "border border-rose-400/30 bg-rose-500/10",
    icon: ShieldAlert,
    text: "text-rose-100"
  },
  loading: {
    border: "border border-cyan-300/20 bg-cyan-300/5",
    icon: Loader2,
    text: "text-cyan-100"
  }
};

/**
 * Consistent empty, loading, or blocked state with optional next-step CTA.
 */
export function WorkspaceEmptyState({
  actionHref,
  actionLabel,
  children,
  className,
  message,
  testId = "workspace-empty-state",
  title,
  tone = "muted"
}: WorkspaceEmptyStateProps) {
  const style = toneStyles[tone];
  const Icon = style.icon;

  return (
    <section
      data-testid={testId}
      className={cn(WORKSPACE_CARD, "px-4 py-4", style.border, className)}
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "loading" && "animate-spin", style.text)}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-sm font-semibold", style.text)}>{title}</h3>
          <p className={cn("mt-1 text-sm leading-6", tone === "muted" ? "text-muted-foreground" : style.text)}>
            {message}
          </p>
          {children}
          {actionHref && actionLabel ? (
            <div className="mt-3">
              <Link
                to={actionHref}
                className={buttonVariants({
                  variant: tone === "warning" || tone === "danger" ? "secondary" : "default",
                  size: "sm"
                })}
              >
                {actionLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
