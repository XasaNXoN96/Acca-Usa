"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const indicatorVariants = cva("h-full rounded-full transition-[width] duration-300", {
  variants: {
    tone: {
      primary: "bg-primary",
      navy: "bg-navy",
      acca: "bg-acca",
      azure: "bg-azure",
      fia: "bg-fia",
      success: "bg-success",
    },
  },
  defaultVariants: { tone: "primary" },
});

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof indicatorVariants> {
  /** Accessible name — required because a bar alone says nothing to a screen reader. */
  label: string;
}

export const Progress = React.forwardRef<React.ComponentRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value = 0, tone, label, ...props }, ref) => {
    const safe = Math.min(100, Math.max(0, value ?? 0));
    return (
      <ProgressPrimitive.Root
        ref={ref}
        value={safe}
        aria-label={label}
        className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
        {...props}
      >
        <ProgressPrimitive.Indicator className={indicatorVariants({ tone })} style={{ width: `${safe}%` }} />
      </ProgressPrimitive.Root>
    );
  },
);
Progress.displayName = "Progress";

/** Circular progress used on dashboards. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 12,
  label,
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const safe = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - safe / 100)}
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
