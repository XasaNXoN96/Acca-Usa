import { TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { TestResult } from "@/types";

export async function ProgressUpdate({ result }: { result: TestResult }) {
  const t = await getTranslations("result");
  return (
    <Card className="mx-auto w-full max-w-xl space-y-3 p-5">
      <h2 className="type-h3 flex items-center gap-2">
        <TrendingUp className="size-5 text-primary" aria-hidden />
        {t("progressUpdate")}
      </h2>
      <p className="text-sm">{t("progressText", { subject: result.subjectName, before: result.progressBefore, after: result.progressAfter })}</p>
      <Progress value={result.progressAfter} tone="primary" label={`${result.subjectName} ${result.progressAfter}%`} />
      {result.progressAfter <= result.progressBefore ? <p className="type-caption text-muted-foreground">{t("progressPassHint")}</p> : null}
    </Card>
  );
}
