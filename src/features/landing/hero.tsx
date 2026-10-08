import Link from "next/link";
import { ArrowRight, BookOpenCheck, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Progress, ProgressRing } from "@/components/ui/progress";
import { HighlightStrip } from "./highlight-strip";
import { routes } from "@/lib/routes";

export async function Hero() {
  const t = await getTranslations("landing.hero");
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-app to-background">
      <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div className="space-y-6">
          <h1 className="type-display text-balance text-navy">
            {t("titleLine1")} <br className="hidden sm:block" />
            {t("titleLine2")} <span className="text-primary">{t("titleAccent")}</span>
          </h1>
          <p className="type-body max-w-xl text-pretty text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={routes.register}>
                {t("primary")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={routes.courses}>{t("secondary")}</Link>
            </Button>
          </div>
        </div>
        <HeroVisual />
      </div>
      <HighlightStrip />
    </section>
  );
}

/** Decorative product preview — built from real UI primitives, hidden from assistive tech. */
async function HeroVisual() {
  const t = await getTranslations("landing.hero");
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-[#16396b] shadow-lg">
      <div className="space-y-4 p-5 sm:p-8">
        <div className="rounded-2xl bg-background p-5 shadow-lg">
          <div className="flex items-center gap-4">
            <ProgressRing value={65} size={84} stroke={9} label="65%">
              <span className="text-lg font-bold">65%</span>
            </ProgressRing>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="type-h3">{t("cardTitle")}</p>
              <p className="type-small text-muted-foreground">{t("cardText")}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-background p-4 shadow-md">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <PlayCircle className="size-4 text-primary" /> MA
            </div>
            <Progress value={70} label="70%" tone="primary" />
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> 12:34 / 28:15
            </div>
          </div>
          <div className="rounded-2xl bg-background p-4 shadow-md">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <BookOpenCheck className="size-4 text-cima" /> Test
            </div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              8 / 10 <CheckCircle2 className="size-5 text-success" />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">80%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
