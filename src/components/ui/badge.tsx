import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "type-caption inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-foreground",
        navy: "border-transparent bg-navy text-navy-foreground",
        acca: "border-transparent bg-acca-soft text-acca",
        cima: "border-transparent bg-cima-soft text-cima",
        fia: "border-transparent bg-fia-soft text-fia",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        destructive: "border-transparent bg-destructive-soft text-destructive",
        info: "border-transparent bg-info-soft text-info",
        outline: "border-input bg-background text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
