import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("searchPage"))("title") };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = (raw ?? "").trim().slice(0, 100);
  const [t, c, hits] = await Promise.all([getTranslations("searchPage"), getTranslations("common"), services.search.search(q)]);

  return (
    <div className="container-page space-y-8 py-10 sm:py-14">
      <PageHeader title={t("title")} description={t("description")} />
      <form action="/search" role="search" className="flex max-w-2xl gap-2">
        <label htmlFor="q" className="sr-only">{t("placeholder")}</label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder={t("placeholder")} className="flex-1" maxLength={100} />
        <Button type="submit"><Search aria-hidden />{c("search")}</Button>
      </form>

      {q.length < 2 ? (
        <p className="type-small text-muted-foreground">{t("hint")}</p>
      ) : hits.length === 0 ? (
        <EmptyState icon={<Search aria-hidden />} title={t("emptyTitle")} description={t("emptyText")} />
      ) : (
        <section aria-live="polite" className="space-y-3">
          <h2 className="type-small font-semibold text-muted-foreground">{t("results", { count: hits.length, query: q })}</h2>
          <ul className="grid gap-3">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Card interactive className="p-0">
                  <Link href={h.href} className="flex min-h-14 items-center gap-3 rounded-xl p-4">
                    <Badge variant="outline">{t(`kinds.${h.kind}`)}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{h.title}</span>
                      <span className="type-caption block truncate text-muted-foreground">{h.context}</span>
                    </span>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
