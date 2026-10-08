import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/states";
import { PlatformMark } from "@/components/layout/platform-mark";
import { PublicTopicAccordion } from "./public-topic-accordion";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { platformTheme } from "@/lib/platform-theme";
import type { Subject } from "@/types";

/**
 * The PUBLIC face of a subject: header + outline of topic titles. Built only from services.topics.listPublic(),
 * so adding / renaming / archiving a topic in the admin changes it immediately, for every platform and subject.
 */
export async function PublicSubjectView({ subject, access }: { subject: Subject; access: "login_required" | "enrollment_required" }) {
  const [t, c, platform, topics] = await Promise.all([
    getTranslations("publicSubject"),
    getTranslations("common"),
    services.platforms.getBySlug(subject.platform),
    services.topics.listPublic(subject.slug),
  ]);
  const level = platform?.levels.find((l) => l.id === subject.levelId);
  const platformName = platform?.name ?? subject.platform.toUpperCase();
  const theme = platformTheme[subject.platform];
  const rows = topics.map((x) => {
    const target = routes.subjectTopic(subject.slug, x.id);
    return {
      id: x.id,
      order: x.order,
      title: x.title,
      href: access === "login_required" ? `${routes.login}?next=${encodeURIComponent(target)}` : routes.coursePlatform(subject.platform),
    };
  });

  return (
    <div className="container-page max-w-4xl space-y-8 py-8 sm:py-12">
      <div className="space-y-4">
        <Breadcrumbs
          label={c("breadcrumb")}
          items={[{ label: platformName, href: routes.platform(subject.platform) }, ...(level ? [{ label: level.name }] : []), { label: subject.code }]}
        />
        <div className="flex items-center gap-4">
          <PlatformMark platform={subject.platform} size="lg" />
          <div className="min-w-0 space-y-1.5">
            <h1 className="type-h1 text-balance">{subject.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={theme.badge}>{subject.code}</Badge>
              {level ? <span>{level.name}</span> : null}
            </p>
          </div>
        </div>
      </div>

      <section aria-labelledby="course-topics" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="course-topics" className="type-h2">{t("courseTopics")}</h2>
          <Badge variant="navy" className="px-3 py-1 text-sm">{t("topicsBadge", { count: topics.length })}</Badge>
        </div>
        {topics.length === 0 ? (
          <EmptyState title={t("noTopics")} />
        ) : (
          <PublicTopicAccordion topics={rows} access={access} platformName={platformName} />
        )}
        <Alert variant="info">{t("notice")}</Alert>
      </section>
    </div>
  );
}
