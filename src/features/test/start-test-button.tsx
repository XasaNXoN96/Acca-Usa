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
  const [error, setError] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(false);
            const res = await startTestAction({ testId });
            if (res.ok) router.refresh();
            else setError(true);
          })
        }
      >
        <Play aria-hidden />
        {resume ? t("resume") : t("start")}
      </Button>
      {error ? <p role="alert" className="type-small font-medium text-destructive">{t("startError")}</p> : null}
    </div>
  );
}
