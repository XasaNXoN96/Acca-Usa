import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Progress, ProgressRing } from "@/components/ui/progress";
import { ErrorState } from "@/components/ui/states";
import { can } from "@/lib/permissions";
import { platformTheme } from "@/lib/platform-theme";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.statistics"))("title") };
}

// DEMO numbers only — replaced by aggregate queries in the backend block.
const signups = [18, 26, 31, 29, 44, 52];
const months = [0, 1, 2, 3, 4, 5].map((m) => new Date(Date.UTC(2026, 4 + m, 1)));
const completion = [
  { slug: "acca", value: 62 },
  { slug: "cima", value: 41 },
  { slug: "fia", value: 18 },
] as const;

export default async function StatisticsPage() {
  const [t, s, f, session] = await Promise.all([
    getTranslations("admin.statistics"),
    getTranslations("states"),
    getFormatter(),
    requireSession(STAFF_ROLES),
  ]);
  if (!can(session.user.role, "view_statistics")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  const max = Math.max(...signups);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle as="h2">{t("signups")}</CardTitle></CardHeader>
          <CardContent>
            <figure>
              <div role="img" aria-label={t("signups") + ": " + signups.join(", ")} className="flex h-56 items-end gap-3 border-b border-border px-2 pb-0 sm:gap-5">
                {signups.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                    <span className="type-caption font-semibold tabular-nums">{v}</span>
                    <div className="w-full max-w-12 rounded-t-md bg-navy" style={{ height: `${(v / max) * 80}%` }} />
                  </div>
                ))}
              </div>
              <ul className="type-caption mt-2 grid grid-cols-6 gap-3 text-center text-muted-foreground sm:gap-5" aria-hidden>
                {months.map((m) => (
                  <li key={m.toISOString()}>{f.dateTime(m, { month: "short", timeZone: "UTC" })}</li>
                ))}
              </ul>
              <figcaption className="sr-only">{t("signups")}</figcaption>
            </figure>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">{t("avgScore")}</CardTitle></CardHeader>
          <CardContent className="grid place-items-center py-4">
            <ProgressRing value={74} size={150} stroke={14} label={`${t("avgScore")} 74%`}>
              <span className="text-3xl font-extrabold">74%</span>
            </ProgressRing>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle as="h2">{t("completion")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {completion.map((c) => (
              <div key={c.slug} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold uppercase">{c.slug}</span>
                  <span className="tabular-nums">{c.value}%</span>
                </div>
                <Progress value={c.value} tone={platformTheme[c.slug].tone} label={`${c.slug.toUpperCase()} ${c.value}%`} className="h-2.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
