import Link from "next/link";
import { BarChart3, ClipboardCheck, Trophy } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { routes } from "@/lib/routes";

/** My Tests / My Results / My Progress — shortcuts to the pages that already hold that data. */
export async function MyLearningLinks({ availableTests, results }: { availableTests: number; results: number }) {
  const t = await getTranslations("dashboard.mine");
  const items = [
    { href: routes.exams, icon: ClipboardCheck, title: t("tests"), hint: t("testsHint", { count: availableTests }) },
    { href: `${routes.progress}#test-results`, icon: Trophy, title: t("results"), hint: t("resultsHint", { count: results }) },
    { href: routes.progress, icon: BarChart3, title: t("progress"), hint: t("progressHint") },
  ];
  return (
    <nav aria-label={t("title")} data-my-learning className="grid gap-3 sm:grid-cols-3">
      {items.map(({ href, icon: Icon, title, hint }) => (
        <Link key={title} href={href} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-md">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-soft text-navy"><Icon className="size-5" aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{title}</span>
            <span className="type-caption block truncate text-muted-foreground">{hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
