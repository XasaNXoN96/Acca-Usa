import { BookOpen, Clock, GraduationCap, HelpCircle, PlayCircle, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { DemoBadge } from "@/components/ui/demo-badge";
import { isDemoMode } from "@/lib/app-mode";
import { services } from "@/services";
import { Section } from "./section";

/**
 * Demo mode: illustrative placeholder figures, labelled as such. Production: only numbers counted from the real catalogue —
 * never invented learner counts or testimonials.
 */
export async function StatsSection() {
  const t = await getTranslations("landing.stats");
  const f = await getFormatter();
  if (!isDemoMode) {
    const [subjects, topics, tests] = await Promise.all([services.subjects.list(), services.topics.listAll(), services.tests.listPublished("")]);
    const real = [
      { key: "subjects", icon: BookOpen, value: f.number(subjects.length) },
      { key: "topics", icon: GraduationCap, value: f.number(topics.filter((x) => !x.archived).length) },
      { key: "tests", icon: HelpCircle, value: f.number(tests.length) },
    ] as const;
    if (real.every((r) => r.value === "0")) return null;
    return (
      <Section id="stats" title={t("titleLive")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {real.map(({ key, icon: Icon, value }) => (
            <div key={key} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-5 text-center shadow-xs">
              <Icon className="size-5 text-primary" aria-hidden />
              <dd className="text-3xl font-extrabold tracking-tight text-navy">{value}</dd>
              <dt className="type-small text-muted-foreground">{t(`live.${key}`)}</dt>
            </div>
          ))}
        </dl>
      </Section>
    );
  }
  const items = [
    { key: "students", icon: Users, value: f.number(10000) + "+" },
    { key: "lessons", icon: PlayCircle, value: f.number(300) + "+" },
    { key: "questions", icon: HelpCircle, value: f.number(5000) + "+" },
    { key: "access", icon: Clock, value: "24/7" },
  ] as const;
  return (
    <Section id="stats" title={t("title")} titleExtra={<DemoBadge className="mx-auto" />}>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(({ key, icon: Icon, value }) => (
          <div key={key} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-5 text-center shadow-xs">
            <Icon className="size-5 text-primary" aria-hidden />
            <dd className="text-3xl font-extrabold tracking-tight text-navy">{value}</dd>
            <dt className="type-small text-muted-foreground">{t(key)}</dt>
          </div>
        ))}
      </dl>
      <p className="type-caption mt-4 text-center text-muted-foreground">{t("demoNote")}</p>
    </Section>
  );
}
