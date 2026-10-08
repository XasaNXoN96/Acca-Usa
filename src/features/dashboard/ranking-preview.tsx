import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import type { RankingEntry } from "@/types";

export async function RankingPreview({ entries }: { entries: RankingEntry[] }) {
  const [t, f, c] = await Promise.all([getTranslations("dashboard"), getFormatter(), getTranslations("common")]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle as="h2">{t("ranking")}</CardTitle>
        <DemoBadge />
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {entries.map((e) => (
            <li
              key={e.userId}
              aria-current={e.isCurrentUser ? "true" : undefined}
              className={cn("flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm", e.isCurrentUser && "bg-navy-soft font-semibold")}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.isCurrentUser ? <Badge variant="navy">{t("you")}</Badge> : null}
              <span className="shrink-0 tabular-nums text-muted-foreground">{t("points", { points: f.number(e.points) })}</span>
            </li>
          ))}
        </ol>
        <Link href={routes.ranking} className="type-small mt-3 inline-flex min-h-8 items-center font-semibold text-primary hover:underline">
          {c("viewAll")} →
        </Link>
      </CardContent>
    </Card>
  );
}
