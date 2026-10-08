import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { services } from "@/services";
import { requireSession } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("exams"))("title") };
}

const statusVariant = { scheduled: "info", open: "success", completed: "neutral" } as const;

export default async function ExamsPage() {
  const session = await requireSession();
  const [t, c, locale, exams, tests, subjects] = await Promise.all([
    getTranslations("exams"),
    getTranslations("common"),
    getLocale(),
    services.exams.list(),
    services.tests.listPublished(session.user.id),
    services.subjects.list(),
  ]);
  const subjectName = (slug: string) => subjects.find((s) => s.slug === slug)?.code ?? slug;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      {exams.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <DataTable
          caption={t("title")}
          columns={[
            { key: "title", header: c("name"), mobile: "title" },
            { key: "starts", header: t("starts") },
            { key: "duration", header: t("durationHeader") },
            { key: "status", header: c("status") },
            { key: "score", header: t("score"), align: "right" },
          ]}
          rows={exams.map((e) => ({
            id: e.id,
            cells: {
              title: (
                <span className="flex flex-col">
                  <span className="font-semibold">{e.title}</span>
                  <span className="type-caption text-muted-foreground">{subjectName(e.subjectSlug)}</span>
                </span>
              ),
              starts: formatDateTime(e.startsAt, locale),
              duration: t("duration", { count: e.durationMinutes }),
              status: <Badge variant={statusVariant[e.status]}>{t(`status.${e.status}`)}</Badge>,
              score: e.score !== undefined ? `${e.score}%` : "—",
            },
          }))}
        />
      )}
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="type-h3">{t("practiceTests")}</h2>
          <p className="type-small text-muted-foreground">{t("practiceText")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tests.map((x) => (
            <Button key={x.id} asChild variant="outline" size="sm" className="h-auto min-h-9 max-w-full shrink whitespace-normal py-1.5 text-left">
              <Link href={routes.test(x.id)}>{x.title}</Link>
            </Button>
          ))}
        </div>
      </Card>
    </>
  );
}
