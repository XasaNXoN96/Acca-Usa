import type { Metadata } from "next";
import { Medal, Trophy } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { RankingFilters } from "@/features/ranking/ranking-filters";
import { services } from "@/services";
import { requireSession } from "@/lib/auth/guards";
import { isPlatformSlug } from "@/lib/platform-theme";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ranking"))("title") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const medal = ["text-warning", "text-muted-foreground", "text-primary"] as const;

export default async function RankingPage({ searchParams }: { searchParams: Search }) {
  const [session, sp, platforms, subjects] = await Promise.all([requireSession(), searchParams, services.platforms.list(), services.subjects.list()]);
  // Query → validated filter; unknown values are ignored (never passed to the service).
  const p = one(sp.platform);
  const s = one(sp.subject);
  const platform = p && isPlatformSlug(p) && platforms.some((x) => x.slug === p) ? p : undefined;
  const subject = s && subjects.some((x) => x.slug === s) ? s : undefined;

  const [t, d, f, result] = await Promise.all([
    getTranslations("ranking"),
    getTranslations("dashboard"),
    getFormatter(),
    services.ranking.list({ userId: session.user.id, platform, subjectSlug: subject, limit: 50 }),
  ]);
  const { entries, me, total } = result;
  const rows = [...entries, ...(me && !entries.includes(me) ? [me] : [])];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      <RankingFilters
        platform={platform}
        subject={subject}
        platforms={platforms.map((x) => ({ value: x.slug, label: x.name }))}
        subjects={subjects.filter((x) => !platform || x.platform === platform).map((x) => ({ value: x.slug, label: `${x.platform.toUpperCase()} · ${x.code} — ${x.name}` }))}
      />

      {me ? (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4" data-my-rank>
          <span className="grid size-12 place-items-center rounded-xl bg-navy-soft text-navy"><Trophy className="size-6" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("yourPosition", { rank: me.rank, total })}</p>
            <p className="type-small text-muted-foreground">{t("yourStats", { points: f.number(me.points), tests: me.testsCompleted, progress: me.progress })}</p>
          </div>
        </Card>
      ) : (
        <p className="type-small text-muted-foreground" data-my-rank-empty>{t("notRanked")}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyText")} />
      ) : (
        <DataTable
          caption={t("title")}
          columns={[
            { key: "rank", header: t("rank"), className: "w-20" },
            { key: "student", header: t("student"), mobile: "title" },
            { key: "points", header: t("points"), align: "right" },
            { key: "tests", header: t("tests"), align: "right" },
            { key: "progress", header: t("progress") },
          ]}
          rows={rows.map((e) => ({
            id: `${e.rank}-${e.name}-${e.isCurrentUser ? "me" : "other"}`,
            highlighted: e.isCurrentUser,
            cells: {
              rank: (
                <span className="flex items-center gap-1.5 font-bold tabular-nums">
                  {e.rank <= 3 ? <Medal className={cn("size-4", medal[e.rank - 1])} aria-hidden /> : null}#{e.rank}
                </span>
              ),
              student: (
                <span className="flex items-center gap-2 font-semibold">
                  {e.name}
                  {e.isCurrentUser ? <Badge variant="navy">{d("you")}</Badge> : null}
                </span>
              ),
              points: f.number(e.points),
              tests: e.testsCompleted,
              progress: (
                <span className="flex min-w-28 items-center gap-2">
                  <Progress value={e.progress} tone="navy" label={`${e.name} ${e.progress}%`} className="h-1.5 flex-1" />
                  <span className="type-caption w-9 text-right font-semibold tabular-nums">{e.progress}%</span>
                </span>
              ),
            },
          }))}
        />
      )}
      <p className="type-caption text-muted-foreground">{t("howItWorks")}</p>
    </>
  );
}
