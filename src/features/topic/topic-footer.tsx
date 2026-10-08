"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markTopicCompletedAction } from "./actions";

interface Props {
  topicId: string;
  completed: boolean;
  previousHref: string | null;
  nextHref: string | null;
}

export function TopicFooter({ topicId, completed, previousHref, nextHref }: Props) {
  const t = useTranslations("topic");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const complete = () =>
    start(async () => {
      setError(false);
      const res = await markTopicCompletedAction({ topicId });
      if (res.ok) router.refresh();
      else setError(true);
    });

  return (
    <div className="space-y-2 border-t border-border pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {previousHref ? (
          <Button asChild variant="outline" className="order-2 sm:order-1">
            <Link href={previousHref}>
              <ArrowLeft aria-hidden />
              {t("previous")}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled className="order-2 sm:order-1">
            <ArrowLeft aria-hidden />
            {t("previous")}
          </Button>
        )}

        <div className="order-1 flex justify-center sm:order-2">
          {completed ? (
            <Badge variant="success" className="h-11 px-4 text-sm">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("completed")}
            </Badge>
          ) : (
            <Button onClick={complete} loading={pending} size="lg" className="w-full sm:w-auto">
              <CheckCircle2 aria-hidden />
              {t("markCompleted")}
            </Button>
          )}
        </div>

        {nextHref ? (
          <Button asChild variant="navy" className="order-3">
            <Link href={nextHref}>
              {t("next")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="navy" disabled className="order-3">
            {t("next")}
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="type-caption text-center font-medium text-destructive">
          {t("errorSaving")}
        </p>
      ) : null}
    </div>
  );
}
