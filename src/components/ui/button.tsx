import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out hover:shadow-md active:scale-[0.98] active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:scale-100 disabled:shadow-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(16,185,129,0.18)] hover:bg-primary/90 active:bg-primary/80",
        secondary: "border border-white/10 bg-white/[0.075] text-secondary-foreground hover:bg-white/[0.11] active:bg-white/[0.14]",
        outline: "border border-white/12 bg-black/20 shadow-none hover:bg-white/[0.07] hover:shadow-sm active:bg-white/[0.10]",
        ghost: "shadow-none hover:bg-white/[0.07] hover:shadow-sm active:bg-white/[0.10]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export { buttonVariants };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = "Button";
