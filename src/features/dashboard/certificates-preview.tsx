import Link from "next/link";
import { Award } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/lib/routes";
import type { Certificate } from "@/types";

export async function CertificatesPreview({ items }: { items: Certificate[] }) {
  const [t, c] = await Promise.all([getTranslations("dashboard"), getTranslations("common")]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("certificates")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-3">
          {items.slice(0, 2).map((cert) => (
            <li key={cert.id} className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
                <Award className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="line-clamp-2 block text-sm font-semibold">{cert.title}</span>
                {cert.status === "earned" ? (
                  <Link href={routes.certificate(cert.id)} className="inline-flex min-h-8 items-center"><Badge variant="success">{t("earned")}</Badge></Link>
                ) : cert.status === "revoked" ? (
                  <Badge variant="destructive">{t("revoked")}</Badge>
                ) : (
                  <span className="flex items-center gap-2">
                    <Progress value={cert.progress} tone="navy" label={`${cert.title} ${cert.progress}%`} className="h-1.5 flex-1" />
                    <span className="type-caption font-semibold tabular-nums">{cert.progress}%</span>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <Link href={routes.certificates} className="type-small inline-flex min-h-8 items-center font-semibold text-primary hover:underline">
          {c("viewAll")} →
        </Link>
      </CardContent>
    </Card>
  );
}
