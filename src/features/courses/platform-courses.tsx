import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { PlatformMark } from "@/components/layout/platform-mark";
import { SubjectCard } from "./subject-card";
import { services } from "@/services";
import { platformTheme } from "@/lib/platform-theme";
import type { PlatformSlug } from "@/types";
import { notFound } from "next/navigation";

/** One platform: header + subjects grouped by level, with the student's progress. */
export async function PlatformCourses({ slug, userId, headingLevel = "h2" }: { slug: PlatformSlug; userId: string; headingLevel?: "h1" | "h2" }) {
  const [t, platform, subjects] = await Promise.all([
    getTranslations("platformPage"),
    services.platforms.getBySlug(slug),
    services.subjects.listByPlatform(slug),
  ]);
  if (!platform) notFound();
  const progress = await Promise.all(subjects.map((s) => services.progress.getSubjectProgress(userId, s.slug)));
  const percentOf = (slugName: string) => progress[subjects.findIndex((s) => s.slug === slugName)]?.percent ?? 0;
  const Heading = headingLevel;
  const theme = platformTheme[slug];

  return (
    <section aria-labelledby={`platform-${slug}`} className="space-y-6">
      <div className="flex items-center gap-3">
        <PlatformMark platform={slug} size="lg" />
        <div className="min-w-0">
          <Heading id={`platform-${slug}`} className={headingLevel === "h1" ? "type-h1" : "type-h2"}>{platform.name}</Heading>
          <p className="type-small text-muted-foreground">{platform.fullName}</p>
        </div>
      </div>
      {platform.levels.map((level) => {
        const list = subjects.filter((s) => s.levelId === level.id);
        return (
          <div key={level.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="type-h3">{level.name}</h3>
              <Badge variant={theme.badge}>{t("subjectsInLevel", { count: list.length })}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => (
                <SubjectCard key={s.slug} subject={s} percent={percentOf(s.slug)} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
