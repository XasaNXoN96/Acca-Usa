import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import type { DashboardOverview } from "@/types";

export async function TestsPreview({ items }: { items: DashboardOverview["tests"] }) {
  const [t, st] = await Promise.all([getTranslations("dashboard"), getTranslations("subject")]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("tests")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map(({ test, subjectName, status, score }) => (
            <li key={test.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cima-soft text-cima">
                <ClipboardList className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{test.title}</span>
                <span className="type-caption block truncate text-muted-foreground">
                  {subjectName} · {st("questions", { count: test.questionCount })}
                </span>
              </span>
              {score !== undefined ? (
                <Badge variant={score >= test.passMark ? "success" : "destructive"}>{score}%</Badge>
              ) : (
                <Badge variant={status === "upcoming" ? "info" : "neutral"}>{status === "upcoming" ? t("upcoming") : t("recent")}</Badge>
              )}
              <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                <Link href={routes.test(test.id)}>{st("startTest")}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
