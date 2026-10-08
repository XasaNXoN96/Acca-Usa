import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { rateLimit } from "@/lib/rate-limit";
import { routes } from "@/lib/routes";
import { services } from "@/services";

type Params = Promise<{ certificateNumber: string }>;

// Verification results must never be indexed or cached by shared caches.
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("certificates.verify"))("title"), robots: { index: false, follow: false } };
}

const NUMBER_RE = /^AU-\d{4}-\d{6}$/;

/**
 * PUBLIC certificate verification. Shows only: status, abbreviated holder ("Maria L."), course, platform, date, number.
 * Never the e-mail, ids, full surname or anything else about the learner. Lookups are rate limited per client.
 */
export default async function VerifyCertificatePage({ params }: { params: Params }) {
  const { certificateNumber } = await params;
  const number = decodeURIComponent(certificateNumber).trim().toUpperCase();
  const [t, f] = await Promise.all([getTranslations("certificates.verify"), getFormatter()]);

  const h = await headers();
  const client = (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local").slice(0, 64);
  const rl = await rateLimit(`verify:${client}`, 30, 10 * 60_000);
  if (!rl.ok) return <div className="container-page py-12"><Alert variant="warning">{t("limited")}</Alert></div>;

  const result = NUMBER_RE.test(number) ? await services.certificates.verifyByNumber(number) : null;
  if (!result) {
    return (
      <div className="container-page max-w-2xl space-y-6 py-10 sm:py-14">
        <PageHeader title={t("title")} description={t("description")} />
        <Alert variant="warning"><p className="font-semibold">{t("notFound")}</p><p>{t("notFoundHint")}</p></Alert>
        <Button asChild variant="outline"><Link href={routes.home}>{t("home")}</Link></Button>
      </div>
    );
  }
  const valid = result.status === "issued";
  const rows: [string, string][] = [
    [t("holder"), result.holder],
    [t("course"), `${result.subjectCode} — ${result.subjectName}`],
    [t("platform"), result.platform.toUpperCase()],
    [t("issued"), f.dateTime(new Date(result.issuedAt), { dateStyle: "long" })],
    [t("number"), result.number],
  ];

  return (
    <div className="container-page max-w-2xl space-y-6 py-10 sm:py-14">
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="space-y-5 p-5 sm:p-8" data-verify-status={result.status}>
        <p role="status" className={`flex items-center gap-2 text-lg font-bold ${valid ? "text-success" : "text-destructive"}`}>
          {valid ? <BadgeCheck className="size-6" aria-hidden /> : <ShieldAlert className="size-6" aria-hidden />}
          {valid ? t("valid") : t("revoked")}
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="type-eyebrow text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="type-small text-muted-foreground">{t("privacy")}</p>
      </Card>
      <Button asChild variant="outline"><Link href={routes.home}>{t("home")}</Link></Button>
    </div>
  );
}
