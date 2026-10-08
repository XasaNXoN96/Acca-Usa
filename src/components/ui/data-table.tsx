import * as React from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataColumn {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Mobile card: the column used as the card title (exactly one), shown inline or hidden. */
  mobile?: "title" | "row" | "hidden";
  className?: string;
}

export interface DataRow {
  id: string;
  cells: Record<string, React.ReactNode>;
  highlighted?: boolean;
}

interface DataTableProps {
  caption: string;
  columns: DataColumn[];
  rows: DataRow[];
  actionsHeader?: string;
  rowActions?: (row: DataRow) => React.ReactNode;
  className?: string;
}

/**
 * Responsive table: a real <table> from md up, stacked cards on phones —
 * never a horizontally-cramped table on a 360px screen.
 */
export function DataTable({ caption, columns, rows, rowActions, actionsHeader, className }: DataTableProps) {
  const title = columns.find((c) => c.mobile === "title") ?? columns[0];
  return (
    <div className={className}>
      <div className="hidden md:block">
        <Table label={caption}>
          <TableCaption>{caption}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </TableHead>
              ))}
              {rowActions ? <TableHead className="w-px whitespace-nowrap text-right">{actionsHeader}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} aria-current={r.highlighted ? "true" : undefined} className={cn(r.highlighted && "bg-navy-soft/60")}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.align === "right" && "text-right tabular-nums", c.className)}>
                    {r.cells[c.key]}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell className="w-px whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">{rowActions(r)}</div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.id} className={cn("space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs", r.highlighted && "border-navy/30 bg-navy-soft/60")}>
            {title ? <div className="font-semibold">{r.cells[title.key]}</div> : null}
            <dl className="space-y-1.5 text-sm">
              {columns
                .filter((c) => c !== title && c.mobile !== "hidden")
                .map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-4">
                    <dt className="type-caption shrink-0 text-muted-foreground">{c.header}</dt>
                    <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{r.cells[c.key]}</dd>
                  </div>
                ))}
            </dl>
            {rowActions ? <div className="flex justify-end gap-2 border-t border-border pt-3">{rowActions(r)}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
