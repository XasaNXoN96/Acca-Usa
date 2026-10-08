import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { platformTheme } from "@/lib/platform-theme";
import type { AdminStats } from "@/types";

const Empty = ({ text }: { text: string }) => <p className="type-small rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">{text}</p>;

/** Student activity: distinct active students per day / month in the selected range (real events only). */
export async function ActivityChart({ stats }: { stats: AdminStats }) {
  const t = await getTranslations("admin.statistics");
  const max = Math.max(1, ...stats.activity.map((a) => a.activeStudents));
  const total = stats.activity.reduce((s, a) => s + a.attempts + a.completedMaterials, 0);
  const hasData = stats.activity.some((a) => a.activeStudents > 0);
  const step = Math.max(1, Math.ceil(stats.activity.length / 6));
  return (
    <Card className="lg:col-span-2" data-chart="activity">
      <CardHeader><CardTitle as="h2">{t("charts.activity")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!hasData ? (
          <Empty text={t("empty.activity")} />
        ) : (
          <figure>
            <div role="img" aria-label={`${t("charts.activity")}: ${stats.activity.map((a) => `${a.label} ${a.activeStudents}`).join(", ")}`} className="flex h-48 items-end gap-0.5 border-b border-border sm:gap-1">
              {stats.activity.map((a) => (
                <div key={a.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${a.label}: ${t("charts.activeStudentsN", { count: a.activeStudents })}`}>
                  <div className="w-full rounded-t-sm bg-navy" style={{ height: `${(a.activeStudents / max) * 100}%`, minHeight: a.activeStudents ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <ul className="type-caption mt-1.5 flex justify-between text-muted-foreground" aria-hidden>
              {stats.activity.filter((_, i) => i % step === 0).map((a) => <li key={a.key}>{stats.activityBucket === "day" ? a.label.slice(5) : a.label}</li>)}
            </ul>
            <figcaption className="type-caption mt-2 text-muted-foreground">{t("charts.activityCaption", { events: total, max })}</figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}

export async function PassFailCard({ stats }: { stats: AdminStats }) {
  const t = await getTranslations("admin.statistics");
  const { passed, failed } = stats.passFail;
  const total = passed + failed;
  return (
    <Card data-chart="passfail">
      <CardHeader><CardTitle as="h2">{t("charts.passFail")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <Empty text={t("empty.attempts")} />
        ) : (
          <>
            <div role="img" aria-label={`${t("charts.passed")}: ${passed}, ${t("charts.failed")}: ${failed}`} className="flex h-6 overflow-hidden rounded-full bg-muted">
              <div className="bg-success" style={{ width: `${(passed / total) * 100}%` }} />
              <div className="bg-warning" style={{ width: `${(failed / total) * 100}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2.5 rounded-full bg-success" aria-hidden />{t("charts.passed")}</dt><dd className="text-2xl font-bold tabular-nums">{passed}</dd></div>
              <div><dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2.5 rounded-full bg-warning" aria-hidden />{t("charts.failed")}</dt><dd className="text-2xl font-bold tabular-nums">{failed}</dd></div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export async function TestPerformanceCard({ stats }: { stats: AdminStats }) {
  const t = await getTranslations("admin.statistics");
  return (
    <Card className="lg:col-span-2" data-chart="tests">
      <CardHeader><CardTitle as="h2">{t("charts.testPerformance")}</CardTitle></CardHeader>
      <CardContent>
        {stats.testPerformance.length === 0 ? (
          <Empty text={t("empty.attempts")} />
        ) : (
          <ul className="space-y-4">
            {stats.testPerformance.map((x) => (
              <li key={x.testId} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{x.subjectCode} · {x.title}</span>
                  <span className="type-caption tabular-nums text-muted-foreground">{t("charts.testRow", { attempts: x.attempts, pass: x.passRate })}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={x.avgScore} tone="navy" label={`${x.title} ${x.avgScore}%`} className="h-2.5 flex-1" />
                  <span className="w-10 text-right text-sm font-bold tabular-nums">{x.avgScore}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function SubjectProgressCard({ stats }: { stats: AdminStats }) {
  const t = await getTranslations("admin.statistics");
  return (
    <Card data-chart="subjects">
      <CardHeader><CardTitle as="h2">{t("charts.subjectProgress")}</CardTitle></CardHeader>
      <CardContent>
        {stats.subjectProgress.length === 0 ? (
          <Empty text={t("empty.subjects")} />
        ) : (
          <ul className="space-y-3">
            {stats.subjectProgress.slice(0, 10).map((s) => (
              <li key={s.subjectSlug} className="space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold">{s.platform.toUpperCase()} · {s.code}</span>
                  <span className="tabular-nums">{s.avgProgress}% <span className="type-caption text-muted-foreground">· {t("charts.studentsN", { count: s.students })}</span></span>
                </div>
                <Progress value={s.avgProgress} tone={platformTheme[s.platform].tone} label={`${s.code} ${s.avgProgress}%`} className="h-2" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
