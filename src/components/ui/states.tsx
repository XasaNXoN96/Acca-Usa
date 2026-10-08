import * as React from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface StateBase {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function StateShell({
  icon,
  tone,
  title,
  description,
  action,
  className,
  role,
}: StateBase & { icon: React.ReactNode; tone: "muted" | "destructive"; role?: "alert" | "status" }) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "grid size-12 place-items-center rounded-full [&_svg]:size-6",
          tone === "destructive" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="max-w-md space-y-1">
        <p className="type-h3">{title}</p>
        {description ? <p className="type-small text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: StateBase & { icon?: React.ReactNode }) {
  return <StateShell {...props} tone="muted" icon={props.icon ?? <Inbox aria-hidden />} />;
}

export function ErrorState(props: StateBase) {
  return <StateShell {...props} tone="destructive" role="alert" icon={<AlertTriangle aria-hidden />} />;
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex items-center justify-center gap-2 py-12 text-muted-foreground", className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="type-small">{label}</span>
    </div>
  );
}

/** Generic page skeleton used by route-level loading.tsx files. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
