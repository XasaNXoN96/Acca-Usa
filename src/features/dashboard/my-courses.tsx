import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PlatformMark } from "@/components/layout/platform-mark";
import { EnrollButton } from "@/features/courses/enroll-buttons";
import { platformTheme } from "@/lib/platform-theme";
import { routes } from "@/lib/routes";
import type { Enrollment, Platform } from "@/types";

export async function MyCourses({ enrollments, platforms }: { enrollments: Enrollment[]; platforms: Platform[] }) {
  const [t, f, c] = await Promise.all([getTranslations("dashboard"), getFormatter(), getTranslations("common")]);
  const full = (slug: string) => platforms.find((p) => p.slug === slug)?.fullName ?? "";

  return (
    <section aria-labelledby="my-courses-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="my-courses-title" className="type-h3">{t("myCourses")}</h2>
        <Button asChild variant="link" size="sm" className="min-h-8 pointer-coarse:min-h-10"><Link href={routes.courses}>{c("viewAll")} →</Link></Button>
      </div>

      {/* Mobile: compact tappable rows */}
      <ul className="space-y-2 md:hidden">
        {enrollments.map((e) => {
          const active = e.status === "active";
          return (
            <li key={e.platform}>
              <Link href={routes.coursePlatform(e.platform)} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
                <PlatformMark platform={e.platform} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold uppercase">{e.platform}</span>
                  {active ? (
                    <span className="mt-1 flex items-center gap-2">
                      <Progress value={e.progress} tone={platformTheme[e.platform].tone} label={`${e.platform.toUpperCase()} ${e.progress}%`} className="h-1.5 flex-1" />
                      <span className="type-caption font-semibold tabular-nums">{f.number(e.progress / 100, { style: "percent" })}</span>
                    </span>
                  ) : (
                    <span className="type-caption text-muted-foreground">{t("notEnrolled")}</span>
                  )}
                </span>
                {active ? <ChevronRight className="size-5 text-muted-foreground" aria-hidden /> : <Lock className="size-4 text-muted-foreground" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Tablet / desktop: cards */}
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {enrollments.map((e) => {
          const theme = platformTheme[e.platform];
          const active = e.status === "active";
          return (
            <Card key={e.platform} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <PlatformMark platform={e.platform} />
                <Badge variant={active ? "success" : "outline"}>{active ? t("active") : t("notEnrolled")}</Badge>
              </div>
              <div className="min-w-0">
                <h3 className="type-h3 uppercase">{e.platform}</h3>
                <p className="type-caption line-clamp-2 min-h-8 text-muted-foreground">{full(e.platform)}</p>
              </div>
              <div className="space-y-1.5">
                <div className="type-caption flex justify-between text-muted-foreground">
                  <span>{t("overall")}</span>
                  <span className="font-semibold tabular-nums text-foreground">{f.number(e.progress / 100, { style: "percent" })}</span>
                </div>
                <Progress value={e.progress} tone={theme.tone} label={`${e.platform.toUpperCase()} ${e.progress}%`} />
              </div>
              {active ? (
                <Button asChild variant={theme.button} size="sm" className="mt-auto w-full"><Link href={routes.coursePlatform(e.platform)}>{t("continue")}</Link></Button>
              ) : (
                <EnrollButton platform={e.platform} size="sm" label={t("enroll")} priceCents={e.priceCents} className="mt-auto" />
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
