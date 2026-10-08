import * as React from "react";
import { cn } from "@/lib/utils";

/** Consistent vertical rhythm + heading block for landing sections. */
export function Section({
  id,
  title,
  subtitle,
  tone = "default",
  children,
  className,
  titleExtra,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  tone?: "default" | "muted";
  children: React.ReactNode;
  className?: string;
  titleExtra?: React.ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("py-14 sm:py-20", tone === "muted" && "bg-app", className)}>
      <div className="container-page">
        <div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
          <h2 id={headingId} className="type-h2 text-balance text-navy">
            {title}
          </h2>
          {subtitle ? <p className="type-body text-muted-foreground">{subtitle}</p> : null}
          {titleExtra}
        </div>
        {children}
      </div>
    </section>
  );
}
