import { getFormatter, getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Progress } from "@/components/ui/progress";
import { PlatformMark } from "@/components/layout/platform-mark";
import { platformTheme } from "@/lib/platform-theme";
import { routes } from "@/lib/routes";
import type { Subject } from "@/types";

export async function SubjectHeader({ subject, percent, completed, total }: { subject: Subject; percent: number; completed: number; total: number }) {
  const [t, n, f, c] = await Promise.all([getTranslations("subject"), getTranslations("nav"), getFormatter(), getTranslations("common")]);
  return (
    <div className="space-y-4">
      <Breadcrumbs
        label={c("breadcrumb")}
        items={[
          { label: n("courses"), href: routes.courses },
          { label: subject.platform.toUpperCase(), href: routes.coursePlatform(subject.platform) },
          { label: subject.code },
        ]}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PlatformMark platform={subject.platform} size="lg" />
          <div className="min-w-0">
            <h1 className="type-h1 text-balance">{subject.name} <span className="text-muted-foreground">({subject.code})</span></h1>
            <p className="type-small text-muted-foreground">{t("completedOf", { completed, total })}</p>
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:w-64">
          <div className="type-caption flex justify-between text-muted-foreground">
            <span>{t("overallProgress")}</span>
            <span className="font-semibold tabular-nums text-foreground">{f.number(percent / 100, { style: "percent" })}</span>
          </div>
          <Progress value={percent} tone={platformTheme[subject.platform].tone} label={`${t("overallProgress")} ${percent}%`} />
        </div>
      </div>
    </div>
  );
}
