import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageHeader } from "@/components/ui/page-header";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ranking"))("title") };
}

export default async function RankingPage() {
  const session = await services.auth.getSession("STUDENT");
  const [t, d, f, entries] = await Promise.all([
    getTranslations("ranking"),
    getTranslations("dashboard"),
    getFormatter(),
    services.ranking.top(session.user.id, 50),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      <DataTable
        caption={t("title")}
        columns={[
          { key: "rank", header: t("rank"), className: "w-20" },
          { key: "student", header: t("student"), mobile: "title" },
          { key: "points", header: t("points"), align: "right" },
        ]}
        rows={entries.map((e) => ({
          id: e.userId,
          highlighted: e.isCurrentUser,
          cells: {
            rank: <span className="font-bold tabular-nums">#{e.rank}</span>,
            student: (
              <span className="flex items-center gap-2 font-semibold">
                {e.name}
                {e.isCurrentUser ? <Badge variant="navy">{d("you")}</Badge> : null}
              </span>
            ),
            points: f.number(e.points),
          },
        }))}
      />
      <p className="type-caption text-muted-foreground">{t("demoNote")}</p>
    </>
  );
}
