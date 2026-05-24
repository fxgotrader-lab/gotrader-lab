import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-primary/30 bg-primary/12 text-primary",
      secondary: "border-border bg-secondary text-secondary-foreground",
      success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
      warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
      danger: "border-rose-400/25 bg-rose-400/10 text-rose-200",
      muted: "border-border bg-muted text-muted-foreground"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}
