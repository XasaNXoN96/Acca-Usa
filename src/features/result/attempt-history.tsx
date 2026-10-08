import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { routes } from "@/lib/routes";
import type { ResultListItem } from "@/types";

/** All finished attempts of this test (newest first); each opens its own result + review. */
export async function AttemptHistory({ items, current }: { items: ResultListItem[]; current: string }) {
  const [t, f] = await Promise.all([getTranslations("result"), getFormatter()]);
  return (
    <section aria-labelledby="attempt-history" className="mx-auto w-full max-w-xl space-y-2">
      <h2 id="attempt-history" className="type-h3">{t("history")}</h2>
      <ol className="divide-y divide-border rounded-xl border border-border bg-card">
        {items.map((a, i) => (
          <li key={a.attemptId}>
            <Link
              href={routes.testResult(a.testId, a.attemptId)}
              aria-current={a.attemptId === current ? "true" : undefined}
              className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/60 aria-[current=true]:bg-muted"
            >
              <span className="font-semibold">{t("attemptN", { n: items.length - i })}</span>
              <span className="tabular-nums">{a.scorePercent}%</span>
              <Badge variant={a.passed ? "success" : "warning"}>{a.passed ? t("passedTitle") : t("failedTitle")}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">{f.dateTime(new Date(a.submittedAt), { dateStyle: "medium", timeStyle: "short" })}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
