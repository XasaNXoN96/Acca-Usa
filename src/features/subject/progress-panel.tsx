import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { platformTheme } from "@/lib/platform-theme";
import type { PlatformSlug, TopicWithStatus } from "@/types";

export async function ProgressPanel({ topics, platform }: { topics: TopicWithStatus[]; platform: PlatformSlug }) {
  const t = await getTranslations("subject");
  return (
    <Card className="p-5">
      <h2 className="type-h3 mb-4">{t("progressTitle")}</h2>
      <ul className="space-y-4">
        {topics.map((topic) => (
          <li key={topic.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">
                {topic.order}. {topic.title}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{topic.progress}%</span>
            </div>
            <Progress value={topic.progress} tone={platformTheme[platform].tone} label={`${topic.title} ${topic.progress}%`} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
