import { Award, BarChart3, ClipboardCheck, FileText, ListChecks, Video } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section } from "./section";

export async function FeaturesSection() {
  const t = await getTranslations("landing.features");
  const items = [
    { key: "video", icon: Video, tone: "bg-primary-soft text-primary" },
    { key: "notes", icon: FileText, tone: "bg-cima-soft text-cima" },
    { key: "tests", icon: ListChecks, tone: "bg-fia-soft text-fia" },
    { key: "mocks", icon: ClipboardCheck, tone: "bg-primary-soft text-primary" },
    { key: "progress", icon: BarChart3, tone: "bg-cima-soft text-cima" },
    { key: "certificates", icon: Award, tone: "bg-fia-soft text-fia" },
  ] as const;
  return (
    <Section id="features" tone="muted" title={t("title")} subtitle={t("subtitle")}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ key, icon: Icon, tone }) => (
          <li key={key} className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="type-h3">{t(`${key}.title`)}</h3>
              <p className="type-small mt-1 text-muted-foreground">{t(`${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
