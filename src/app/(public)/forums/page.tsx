import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("forums"))("title") };
}

const categories = [
  { key: "general", badge: "navy" },
  { key: "acca", badge: "acca" },
  { key: "cima", badge: "cima" },
  { key: "fia", badge: "fia" },
  { key: "tips", badge: "warning" },
] as const;

export default async function ForumsPage() {
  const [t, c] = await Promise.all([getTranslations("forums"), getTranslations("common")]);
  return (
    <div className="container-page space-y-8 py-10 sm:py-14">
      <PageHeader title={t("title")} description={t("description")} />
      <Alert variant="info">{t("notice")}</Alert>
      <ul className="grid gap-4 sm:grid-cols-2">
        {categories.map(({ key, badge }) => (
          <li key={key}>
            <Card className="flex h-full items-start gap-4 p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-soft text-navy">
                <MessagesSquare className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="type-h3">{t(`${key}.title`)}</h2>
                <p className="type-small mt-0.5 text-muted-foreground">{t(`${key}.text`)}</p>
              </div>
              <Badge variant={badge}>{c("comingSoon")}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
