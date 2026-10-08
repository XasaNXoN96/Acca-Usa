import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformMark } from "@/components/layout/platform-mark";
import { services } from "@/services";
import { platformTheme } from "@/lib/platform-theme";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { PlatformSlug } from "@/types";
import { notFound } from "next/navigation";

export async function PlatformLanding({ slug }: { slug: PlatformSlug }) {
  const [t, tl, platform, subjects] = await Promise.all([
    getTranslations("platformPage"),
    getTranslations("landing.platforms"),
    services.platforms.getBySlug(slug),
    services.subjects.listByPlatform(slug),
  ]);
  if (!platform) notFound();
  const theme = platformTheme[slug];

  return (
    <>
      <section className={cn("border-b border-border bg-gradient-to-b", theme.gradient)}>
        <div className="container-page flex flex-col gap-6 py-12 sm:py-16 md:flex-row md:items-center">
          <PlatformMark platform={slug} size="lg" className="size-20 text-lg" />
          <div className="max-w-2xl space-y-3">
            <p className={cn("type-eyebrow", theme.text)}>{platform.fullName}</p>
            <h1 className="type-display text-navy">{platform.name}</h1>
            <p className="type-body text-lg text-muted-foreground">{tl(`${slug}.text`)}</p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button asChild size="lg" variant={theme.button}>
                <Link href={routes.register}>
                  {t("ctaTitle", { platform: platform.name })}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="levels-title" className="py-12 sm:py-16">
        <div className="container-page space-y-8">
          <div className="max-w-2xl space-y-2">
            <h2 id="levels-title" className="type-h2 text-navy">{t("levels")}</h2>
            <p className="text-muted-foreground">{t("levelsText")}</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {platform.levels.map((level) => {
              const list = subjects.filter((s) => s.levelId === level.id);
              return (
                <Card key={level.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="type-h3">{level.name}</h3>
                    <Badge variant={theme.badge}>{t("subjectsInLevel", { count: list.length })}</Badge>
                  </div>
                  <ul className="space-y-1">
                    {list.map((s) => (
                      <li key={s.slug}>
                        <Link href={routes.subject(s.slug)} className="group flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-muted">
                          <span className={cn("grid h-7 min-w-10 place-items-center rounded-md px-1.5 text-xs font-bold", theme.soft, theme.text)}>{s.code}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                          <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="includes-title" className="bg-app py-12 sm:py-16">
        <div className="container-page grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <h2 id="includes-title" className="type-h2 text-navy">{t("includes")}</h2>
            <ul className="space-y-3">
              {(["i1", "i2", "i3", "i4"] as const).map((k) => (
                <li key={k} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={cn("rounded-2xl border p-8", theme.soft, theme.border)}>
            <h3 className="type-h2 text-navy">{t("ctaTitle", { platform: platform.name })}</h3>
            <p className="mt-2 text-muted-foreground">{t("ctaText")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant={theme.button}>
                <Link href={routes.register}>{t("ctaTitle", { platform: platform.name })}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={routes.coursePlatform(slug)}>{tl(`${slug}.cta`)}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export async function platformMetadata(slug: PlatformSlug) {
  const t = await getTranslations("landing.platforms");
  return { title: `${t(`${slug}.name`)} — ${t(`${slug}.full`)}` };
}
