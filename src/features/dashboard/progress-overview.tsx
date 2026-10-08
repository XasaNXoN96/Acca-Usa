import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress";
import type { DashboardOverview } from "@/types";

export async function ProgressOverview({ data, overall }: { data: DashboardOverview["progressBreakdown"]; overall: number }) {
  const t = await getTranslations("dashboard");
  const rows = [
    { label: t("completedTopics"), value: data.completed, dot: "bg-success" },
    { label: t("inProgressTopics"), value: data.inProgress, dot: "bg-primary" },
    { label: t("notStartedTopics"), value: data.notStarted, dot: "bg-border" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("yourProgress")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
        <ProgressRing value={overall} size={128} stroke={12} label={`${t("overall")} ${overall}%`}>
          <span className="text-center">
            <span className="block text-2xl font-extrabold leading-none">{overall}%</span>
          </span>
        </ProgressRing>
        <dl className="w-full flex-1 space-y-2.5 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span className={`size-2.5 rounded-full ${r.dot}`} aria-hidden />
                {r.label}
              </dt>
              <dd className="font-semibold tabular-nums">{r.value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
            <dt className="text-muted-foreground">{t("totalTopics")}</dt>
            <dd className="font-semibold tabular-nums">{data.total}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
