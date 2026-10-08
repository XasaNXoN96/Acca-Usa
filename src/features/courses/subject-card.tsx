import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { platformTheme } from "@/lib/platform-theme";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Subject } from "@/types";

export async function SubjectCard({ subject, percent }: { subject: Subject; percent: number }) {
  const [t, tc, f] = await Promise.all([getTranslations("subject"), getTranslations("common"), getFormatter()]);
  const theme = platformTheme[subject.platform];
  return (
    <Card interactive className="p-0">
      <Link href={routes.subject(subject.slug)} className="flex h-full flex-col gap-3 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className={cn("grid h-11 min-w-12 place-items-center rounded-lg px-2 text-sm font-extrabold", theme.soft, theme.text)}>{subject.code}</span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block font-semibold leading-snug">{subject.name}</span>
            <span className="type-caption text-muted-foreground">{tc("topicsCount", { count: subject.topicCount })}</span>
          </span>
        </div>
        <div className="mt-auto space-y-1.5">
          <div className="type-caption flex items-center justify-between text-muted-foreground">
            <span>{t("overallProgress")}</span>
            <span className="font-semibold tabular-nums text-foreground">{f.number(percent / 100, { style: "percent" })}</span>
          </div>
          <Progress value={percent} tone={theme.tone} label={`${subject.name} ${percent}%`} className="h-1.5" />
        </div>
        <span className="sr-only">
          <ArrowRight aria-hidden />
        </span>
      </Link>
    </Card>
  );
}
