import { Clock, PlayCircle, Users, HelpCircle } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { DemoBadge } from "@/components/ui/demo-badge";
import { Section } from "./section";

/** Every figure here is placeholder data and is labelled as such — never present these as real results. */
export async function StatsSection() {
  const t = await getTranslations("landing.stats");
  const f = await getFormatter();
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
