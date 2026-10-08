import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { CertificateDocument } from "@/features/certificates/certificate-document";
import { PrintCertificateButton } from "@/features/certificates/print-button";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { requireSession } from "@/lib/auth/guards";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("certificates"))("title") };
}

/** Owner or admin only (checked on the server); anybody else gets a 404, never the document. */
export default async function CertificatePage({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireSession();
  const [t, n, c, cert] = await Promise.all([
    getTranslations("certificates"),
    getTranslations("nav"),
    getTranslations("common"),
    services.certificates.getForUser(session.user.id, id, session.user.role === "ADMIN"),
  ]);
  if (!cert) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs label={c("breadcrumb")} items={[{ label: n("certificates"), href: routes.certificates }, { label: cert.number }]} className="no-print" />
      <div className="no-print flex flex-wrap items-center gap-3">
        <Button asChild variant="outline"><Link href={routes.certificates}><ArrowLeft aria-hidden />{t("back")}</Link></Button>
        {cert.status === "issued" ? (
          <>
            <Button asChild><a href={`/api/certificates/${encodeURIComponent(cert.id)}/pdf`} download><Download aria-hidden />{t("downloadPdf")}</a></Button>
            <PrintCertificateButton />
            <Button asChild variant="outline"><Link href={`/verify/certificate/${encodeURIComponent(cert.number)}`}><ShieldCheck aria-hidden />{t("verifyLink")}</Link></Button>
          </>
        ) : null}
      </div>
      {cert.status === "revoked" ? <Alert variant="warning" className="no-print">{t("revokedNotice")}</Alert> : <p className="no-print type-small text-muted-foreground">{t("printHint")}</p>}
      <CertificateDocument cert={cert} printId />
    </div>
  );
}
