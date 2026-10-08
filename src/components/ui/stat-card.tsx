import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary-soft text-primary",
  cima: "bg-cima-soft text-cima",
  fia: "bg-fia-soft text-fia",
  warning: "bg-warning-soft text-warning",
  navy: "bg-navy-soft text-navy",
} as const;

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "navy",
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs", className)}>
      <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5", tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tracking-tight">{value}</p>
        <p className="type-caption mt-1 line-clamp-2 text-muted-foreground">{label}</p>
        {hint ? <p className="type-caption line-clamp-1 text-subtle-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
