import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformMark } from "@/components/layout/platform-mark";
import { EnrollButton } from "./enroll-buttons";
import { services } from "@/services";
import { platformTheme } from "@/lib/platform-theme";
import { cn } from "@/lib/utils";
import type { PlatformSlug } from "@/types";

/** Shown instead of platform content until the learner enrols. Subject names are visible; nothing else is. */
export async function PlatformGate({ slug }: { slug: PlatformSlug }) {
  const [t, platform, subjects] = await Promise.all([getTranslations("courses"), services.platforms.getBySlug(slug), services.subjects.listByPlatform(slug)]);
  if (!platform) return null;
  const theme = platformTheme[slug];
  return (
    <Card className={cn("mx-auto max-w-2xl space-y-5 border bg-gradient-to-br p-6 sm:p-8", theme.gradient)}>
      <div className="flex items-center gap-4">
        <PlatformMark platform={slug} size="lg" />
        <div className="min-w-0">
          <h1 className="type-h2">{t("gateTitle", { platform: platform.name })}</h1>
          <p className="type-small text-muted-foreground">{platform.fullName}</p>
        </div>
      </div>
      <p className="text-muted-foreground">{t("gateText")}</p>
      <ul className="flex flex-wrap gap-2" aria-label={platform.name}>
        {subjects.map((s) => (
          <li key={s.slug}>
            <Badge variant="outline" className="gap-1.5"><Lock aria-hidden />{s.code}</Badge>
          </li>
        ))}
      </ul>
      <EnrollButton platform={slug} size="lg" className="max-w-xs" />
    </Card>
  );
}
