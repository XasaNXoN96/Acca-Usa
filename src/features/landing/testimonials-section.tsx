import { Quote } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DemoBadge } from "@/components/ui/demo-badge";
import { isDemoMode } from "@/lib/app-mode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Section } from "./section";

/** Sample quotes from fictional people: DEMO mode only. Production shows no testimonials until real, consented ones exist. */
export async function TestimonialsSection() {
  if (!isDemoMode) return null;
  const t = await getTranslations("landing.testimonials");
  const items = ["t1", "t2", "t3"] as const;
  return (
    <Section id="testimonials" tone="muted" title={t("title")} titleExtra={<DemoBadge className="mx-auto" />}>
      <ul className="grid gap-5 md:grid-cols-3">
        {items.map((k) => (
          <li key={k}>
            <figure className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs">
              <Quote className="size-6 text-primary/70" aria-hidden />
              <blockquote className="type-body flex-1 text-pretty">{t(`${k}.quote`)}</blockquote>
              <figcaption className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback aria-hidden>{t(`${k}.name`).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t(`${k}.name`)}</span>
                  <span className="type-caption block text-muted-foreground">{t(`${k}.role`)}</span>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className="type-caption mt-4 text-center text-muted-foreground">{t("demoNote")}</p>
    </Section>
  );
}
