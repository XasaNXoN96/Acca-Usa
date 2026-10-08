"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { startTestAction } from "./actions";

export function StartTestButton({ testId, resume }: { testId: string; resume: boolean }) {
  const t = useTranslations("test.intro");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        data-start-test
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startTestAction({ testId });
            if (res.ok) router.refresh();
            else setError(res.code ?? "FAILED");
          })
        }
      >
        <Play aria-hidden />
        {resume ? t("resume") : t("start")}
      </Button>
      {error ? <p role="alert" className="type-small font-medium text-destructive">{error === "ATTEMPTS_EXHAUSTED" ? t("noAttemptsText") : error === "EXAM_NOT_OPEN" ? t("examNotOpen") : error === "EXAM_CLOSED" ? t("examClosed") : t("startError")}</p> : null}
    </div>
  );
}
