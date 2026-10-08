import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { routes } from "@/lib/routes";
import type { TestSummary } from "@/types";

export async function TestList({ tests }: { tests: TestSummary[] }) {
  const [t, c] = await Promise.all([getTranslations("subject"), getTranslations("common")]);
  if (tests.length === 0) return <EmptyState title={t("noTests")} />;
  return (
    <ul className="space-y-3">
      {tests.map((test) => (
        <li key={test.id}>
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-azure-soft text-azure">
              <ClipboardList className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-semibold">{test.title}</h3>
              <p className="type-caption text-muted-foreground">
                {t("questions", { count: test.questionCount })} · {c("minutes", { count: test.durationMinutes })} · {t("passMark", { mark: test.passMark })}
              </p>
            </div>
            {test.bestScore !== undefined ? (
              <Badge variant={test.bestScore >= test.passMark ? "success" : "destructive"}>{t("bestScore", { score: test.bestScore })}</Badge>
            ) : null}
            <Button asChild>
              <Link href={routes.test(test.id)}>{test.bestScore !== undefined ? t("retakeTest") : t("startTest")}</Link>
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
