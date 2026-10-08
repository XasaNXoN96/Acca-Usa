import { BarChart3, GraduationCap, MonitorSmartphone, NotebookPen } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function HighlightStrip() {
  const t = await getTranslations("landing.highlights");
  const items = [
    { key: "tutors", icon: GraduationCap, tone: "bg-primary-soft text-primary" },
    { key: "exam", icon: NotebookPen, tone: "bg-primary-soft text-primary" },
    { key: "anytime", icon: MonitorSmartphone, tone: "bg-cima-soft text-cima" },
    { key: "track", icon: BarChart3, tone: "bg-cima-soft text-cima" },
  ] as const;
  return (
    <div className="border-t border-border bg-background">
      <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-5 py-6 lg:grid-cols-4">
        {items.map(({ key, icon: Icon, tone }) => (
          <li key={key} className="flex items-center gap-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone}`}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{t(`${key}.title`)}</span>
              <span className="type-caption block text-muted-foreground">{t(`${key}.text`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
