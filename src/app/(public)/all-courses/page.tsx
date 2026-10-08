import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformMark } from "@/components/layout/platform-mark";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { platformTheme } from "@/lib/platform-theme";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("allCourses"))("title") };
}

/**
 * Public "All courses" step between the landing page and a subject: every platform → level → subject, built from
 * the same services as the mega menu, so admin changes show up here automatically. No materials, no login.
 */
export default async function AllCoursesPage() {
  const [t, platforms, subjects] = await Promise.all([getTranslations("allCourses"), services.platforms.list(), services.subjects.list()]);
  const sections = platforms
    .map((p) => ({
      platform: p,
      levels: p.levels.map((l) => ({ level: l, subjects: subjects.filter((s) => s.levelId === l.id) })).filter((l) => l.subjects.length > 0),
    }))
    .filter((s) => s.levels.length > 0);

  return (
    <div className="container-page space-y-10 py-10 sm:py-14">
      <PageHeader title={t("title")} description={t("description")} />
      {sections.length === 0 ? <EmptyState title={t("empty")} /> : null}
      {sections.map(({ platform, levels }) => {
        const theme = platformTheme[platform.slug];
        return (
          <section key={platform.slug} aria-labelledby={`plat-${platform.slug}`} data-platform-section={platform.slug} className="space-y-5">
            <div className={cn("flex items-center gap-3 border-b-2 pb-3", theme.border)}>
              <PlatformMark platform={platform.slug} />
              <div className="min-w-0">
                <h2 id={`plat-${platform.slug}`} className="type-h2">{platform.name}</h2>
                <p className="type-caption text-muted-foreground">{platform.fullName}</p>
              </div>
            </div>
            {levels.map(({ level, subjects: list }) => (
              <div key={level.id} className="space-y-3">
                {platform.levels.length > 1 ? <h3 className="type-eyebrow text-muted-foreground">{level.name}</h3> : null}
                <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={routes.subject(s.slug)}
                        aria-label={t("open", { subject: `${s.code} — ${s.name}` })}
                        className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs transition-colors hover:bg-muted/60"
                      >
                        <span className={cn("grid min-w-12 shrink-0 place-items-center rounded-lg px-2 py-1 text-sm font-bold", theme.soft, theme.text)}>{s.code}</span>
                        <span className="sr-only"> — </span>
                        <span className="min-w-0 flex-1 text-pretty font-semibold leading-snug">{s.name}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
