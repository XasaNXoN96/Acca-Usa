import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformMark } from "@/components/layout/platform-mark";
import { Section } from "./section";
import { platformOrder, platformTheme } from "@/lib/platform-theme";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export async function PlatformsSection() {
  const t = await getTranslations("landing.platforms");
  return (
    <Section id="platforms" title={t("title")} subtitle={t("subtitle")}>
      <div className="grid gap-5 md:grid-cols-3">
        {platformOrder.map((slug) => {
          const theme = platformTheme[slug];
          return (
            <Card key={slug} interactive className={cn("flex flex-col gap-4 bg-gradient-to-br p-6", theme.gradient)}>
              <div className="flex items-center gap-3">
                <PlatformMark platform={slug} size="lg" />
                <div className="min-w-0">
                  <h3 className="text-xl font-bold">{t(`${slug}.name`)}</h3>
                  <p className={cn("type-caption font-medium", theme.text)}>{t(`${slug}.full`)}</p>
                </div>
              </div>
              <p className="type-small flex-1 text-muted-foreground">{t(`${slug}.text`)}</p>
              <Button asChild variant={theme.button} className="self-start">
                <Link href={routes.platform(slug)}>
                  {t(`${slug}.cta`)}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
