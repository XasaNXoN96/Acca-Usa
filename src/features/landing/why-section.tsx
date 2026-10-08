import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section } from "./section";

export async function WhySection() {
  const t = await getTranslations("landing.why");
  const items = ["r1", "r2", "r3", "r4"] as const;
  return (
    <Section id="why" tone="muted" title={t("title")} subtitle={t("subtitle")}>
      <ul className="mx-auto grid max-w-4xl gap-x-8 gap-y-6 sm:grid-cols-2">
        {items.map((k) => (
          <li key={k} className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div>
              <h3 className="font-semibold">{t(`${k}.title`)}</h3>
              <p className="type-small mt-0.5 text-muted-foreground">{t(`${k}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
