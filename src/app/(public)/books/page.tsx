import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { services } from "@/services";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("books"))("title") };
}

export default async function BooksPage() {
  const [t, tc, tn, tcommon, materials, subjects] = await Promise.all([
    getTranslations("books"),
    getTranslations("subject.materialKinds"),
    getTranslations("nav"),
    getTranslations("common"),
    services.materials.listAll(),
    services.subjects.list(),
  ]);
  const books = materials.filter((m) => m.kind === "book");

  return (
    <div className="container-page space-y-8 py-10 sm:py-14">
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      {books.length === 0 ? (
        <EmptyState
          title={t("empty")}
          description={t("emptyText")}
          action={
            <Button asChild>
              <Link href={routes.courses}>{tn("courses")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <li key={b.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
                  <BookOpen className="size-6" aria-hidden />
                </span>
                <div className="flex-1">
                  <h2 className="type-h3">{b.title}</h2>
                  <p className="type-small text-muted-foreground">
                    {subjects.find((s) => s.slug === b.subjectSlug)?.name} · {tc("book")} · {b.meta}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled className="self-start">
                  <Download aria-hidden />
                  {tcommon("comingSoon")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
