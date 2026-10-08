import type { Metadata } from "next";
import { Award, Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { services } from "@/services";
import { formatDate } from "@/lib/format";
import { requireSession } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("certificates"))("title") };
}

export default async function CertificatesPage() {
  const session = await requireSession();
  const [t, locale, certs] = await Promise.all([getTranslations("certificates"), getLocale(), services.certificates.listForUser(session.user.id)]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      {certs.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {certs.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                    <Award className="size-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold leading-snug">{c.title}</h2>
                    {c.issuedAt ? <p className="type-caption mt-1 text-muted-foreground">{t("issued", { date: formatDate(c.issuedAt, locale) })}</p> : null}
                  </div>
                  <Badge variant={c.status === "earned" ? "success" : "info"}>{c.status === "earned" ? t("earned") : t("inProgress")}</Badge>
                </div>
                {c.status === "earned" ? (
                  <div className="mt-auto space-y-1.5">
                    <Button variant="outline" size="sm" disabled><Download aria-hidden />{t("download")}</Button>
                    <p className="type-caption text-muted-foreground">{t("downloadSoon")}</p>
                  </div>
                ) : (
                  <div className="mt-auto flex items-center gap-2">
                    <Progress value={c.progress} tone="navy" label={`${c.title} ${c.progress}%`} className="flex-1" />
                    <span className="type-small font-semibold tabular-nums">{c.progress}%</span>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
