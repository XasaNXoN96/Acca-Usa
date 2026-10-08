import { getTranslations } from "next-intl/server";
import { Section } from "./section";

export async function ProcessSection() {
  const t = await getTranslations("landing.process");
  const steps = ["step1", "step2", "step3", "step4"] as const;
  return (
    <Section id="process" title={t("title")} subtitle={t("subtitle")}>
      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s} className="relative rounded-xl border border-border bg-card p-5 shadow-xs">
            <span className="mb-4 grid size-10 place-items-center rounded-full bg-navy text-sm font-bold text-navy-foreground" aria-hidden>
              {i + 1}
            </span>
            <h3 className="type-h3">{t(`${s}.title`)}</h3>
            <p className="type-small mt-1 text-muted-foreground">{t(`${s}.text`)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
