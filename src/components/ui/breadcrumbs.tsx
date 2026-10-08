import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, label, className }: { items: Crumb[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="type-small flex flex-wrap items-center gap-x-1 gap-y-0.5 text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm px-0.5 py-1 transition-colors hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate py-1", last && "font-semibold text-foreground")}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
