"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { setMaterialCompletedAction } from "./actions";

/** "Mark as completed" ⇄ "✓ Completed" for the signed-in user + this material (server-stored, not localStorage). */
export function MaterialCompleteButton({ materialId, completed }: { materialId: string; completed: boolean }) {
  const t = useTranslations("material");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const toggle = () =>
    start(async () => {
      setError(false);
      const res = await setMaterialCompletedAction({ materialId, completed: !completed });
      if (res.ok) router.refresh();
      else setError(true);
    });

  return (
    <div className="space-y-1.5">
      <Button
        onClick={toggle}
        loading={pending}
        size="lg"
        variant={completed ? "outline" : "default"}
        aria-pressed={completed}
        title={completed ? t("completedHint") : undefined}
        className={completed ? "w-full border-success/40 bg-success-soft text-success hover:bg-success-soft sm:w-auto" : "w-full sm:w-auto"}
      >
        <CheckCircle2 aria-hidden />
        {completed ? t("completed") : t("markCompleted")}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{t("saveError")}</p> : null}
    </div>
  );
}
