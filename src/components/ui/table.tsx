import * as React from "react";
import { cn } from "@/lib/utils";

/** Scroll container prevents wide tables from breaking the page layout. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Table">
      <table className={cn("w-full min-w-[40rem] caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-muted/60 [&_tr]:border-b", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border transition-colors hover:bg-muted/40", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("type-caption h-11 whitespace-nowrap px-4 text-left align-middle font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("sr-only", className)} {...props} />;
}
