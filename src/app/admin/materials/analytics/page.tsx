import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileText, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { StatsFilters, rangePresets } from "@/features/admin/stats/stats-filters";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { isPlatformSlug } from "@/lib/platform-theme";
import { can } from "@/lib/permissions";
import { services } from "@/services";
import type { StatsFilter } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.materialStats"))("title") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function parseFilter(sp: Record<string, string | string[] | undefined>, platforms: string[], subjects: string[]): { filter: StatsFilter; preset: string } {
  const today = new Date();
  const platform = one(sp.platform);
  const subject = one(sp.subject);
  let preset = one(sp.range) ?? "30";
  let from = one(sp.from);
  let to = one(sp.to);
  if (preset !== "custom" || !from || !ISO.test(from) || !to || !ISO.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) {
    if (!(rangePresets as readonly string[]).includes(preset)) preset = "30";
    to = iso(today);
    from = iso(new Date(today.getTime() - (Number(preset) - 1) * 86_400_000));
    if (preset === "custom") preset = "30";
  }
  return {
    preset,
    filter: {
      platform: platform && isPlatformSlug(platform) && platforms.includes(platform) ? platform : undefined,
      subjectSlug: subject && subjects.includes(subject) ? subject : undefined,
      from: from!, to: to!,
    },
  };
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  const [t, s, session, sp, platforms, subjects, kinds, codes] = await Promise.all([
    getTranslations("admin.materialStats"), getTranslations("states"), requireSession(STAFF_ROLES), searchParams,
    services.platforms.list(), services.subjects.list(), getTranslations("subject.materialKinds"), getTranslations("upload.codes"),
  ]);
  if (!can(session.user.role, "view_statistics")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  const { filter, preset } = parseFilter(sp, platforms.map((p) => p.slug), subjects.map((x) => x.slug));
  const stats = await services.materialStats.get(filter);
  const vt = (v: "draft" | "scheduled" | "published") => (t as unknown as (k: string) => string)(`visibility.${v}`);
  const code = (c?: string) => (c ? (codes as unknown as (k: string) => string)(c) : "");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")}
        actions={<Button asChild variant="outline"><Link href="/admin/materials"><ArrowLeft aria-hidden />{t("back")}</Link></Button>} />
      <StatsFilters filter={filter} preset={preset} platforms={platforms.map((p) => ({ value: p.slug, label: p.name }))}
        subjects={subjects.map((x) => ({ value: x.slug, label: `${x.code} — ${x.name}`, platform: x.platform }))} />
      <p className="type-caption text-muted-foreground" data-stats-range>{t("period", { from: filter.from, to: filter.to })}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-material-totals>
        <StatCard tone="primary" icon={<FileText aria-hidden />} value={stats.totals.materials} label={t("cards.materials")} />
        <StatCard tone="azure" icon={<Eye aria-hidden />} value={stats.totals.views} label={t("cards.views")} />
        <StatCard tone="fia" icon={<Users aria-hidden />} value={stats.totals.uniqueViewers} label={t("cards.viewers")} />
        <StatCard tone="navy" icon={<CheckCircle2 aria-hidden />} value={stats.totals.completions} label={t("cards.completions")} />
        <StatCard tone="warning" icon={<AlertTriangle aria-hidden />} value={stats.totals.processingErrors} label={t("cards.errors")} />
      </div>
      {stats.rows.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[56rem] text-left text-sm" data-material-stats>
            <caption className="sr-only">{t("title")}</caption>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {(["material", "views", "viewers", "completions", "rate", "file", "tests"] as const).map((k) => (
                  <th key={k} scope="col" className={k === "material" || k === "file" ? "p-3 font-medium" : "p-3 text-right font-medium"}>{t(`columns.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.rows.map((r) => (
                <tr key={r.materialId} data-material-row={r.materialId}>
                  <th scope="row" className="min-w-56 p-3 font-medium">
                    <span className="block [overflow-wrap:anywhere]">{r.title}</span>
                    <span className="type-caption flex flex-wrap items-center gap-2 font-normal text-muted-foreground">
                      {r.subjectCode}{r.topicTitle ? ` · ${r.topicTitle}` : ""} · {kinds(r.kind)} <Badge variant={r.visibility === "published" ? "success" : r.visibility === "draft" ? "warning" : "info"}>{vt(r.visibility)}</Badge>
                    </span>
                  </th>
                  <td className="p-3 text-right tabular-nums" data-col="views">{r.views}</td>
                  <td className="p-3 text-right tabular-nums" data-col="viewers">{r.uniqueViewers}</td>
                  <td className="p-3 text-right tabular-nums" data-col="completions">{r.completions}</td>
                  <td className="p-3 text-right tabular-nums" data-col="rate">{r.completionRate === null ? "—" : `${r.completionRate}%`}</td>
                  <td className="p-3" data-col="file">
                    {r.fileStatus === "FAILED" || r.fileStatus === "REJECTED"
                      ? <span className="text-destructive">{t(`fileStatus.${r.fileStatus}`)}{r.errorCode ? `: ${code(r.errorCode)}` : ""}</span>
                      : r.fileStatus && r.fileStatus !== "READY" ? t(`fileStatus.${r.fileStatus}`) : r.fileStatus ? t("fileStatus.READY") : "—"}
                  </td>
                  <td className="p-3 text-right tabular-nums" data-col="tests">{r.topicTestAttempts ? `${r.topicTestAttempts} · ${r.topicTestAvgScore}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="type-caption max-w-3xl text-muted-foreground">{t("notes")}</p>
    </div>
  );
}
