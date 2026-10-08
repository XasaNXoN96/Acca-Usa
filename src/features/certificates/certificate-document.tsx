import { Award } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/app-mode";
import type { IssuedCertificate } from "@/types";

/**
 * The certificate itself. Server component (no client JS), always rendered on "paper" (see .certificate-paper) so it
 * looks the same in light/dark mode and prints cleanly. It makes NO legal claim: the disclaimer states that it only
 * confirms completion of an online course on this platform.
 */
export async function CertificateDocument({ cert, printId = false }: { cert: IssuedCertificate; printId?: boolean }) {
  const [t, f] = await Promise.all([getTranslations("certificates.document"), getFormatter()]);
  const revoked = cert.status === "revoked";
  return (
    <article
      id={printId ? "certificate-print" : undefined}
      aria-label={t("aria", { name: cert.studentName, course: cert.title })}
      data-certificate={cert.id}
      className="certificate-paper relative mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-border shadow-md"
    >
      <div className="m-2 rounded-lg border-2 paper-line p-5 sm:m-4 sm:p-10">
        <div className="relative border border-dashed paper-line p-5 text-center sm:p-10">
          <p className="text-xl font-extrabold tracking-tight sm:text-2xl" aria-label="ACCA USA">ACCA <span className="paper-accent">USA</span></p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] paper-muted sm:text-sm">{t("title")}</p>
          <p className="mt-6 text-sm paper-muted sm:text-base">{t("certifies")}</p>
          <p className="mt-2 text-balance font-serif text-3xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-5xl" data-cert-student>{cert.studentName}</p>
          <p className="mt-6 text-sm paper-muted sm:text-base">{t("completed")}</p>
          <p className="mt-2 text-balance text-xl font-bold leading-snug [overflow-wrap:anywhere] sm:text-3xl" data-cert-course>
            {cert.subjectCode} — {cert.subjectName}
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wider paper-muted">{cert.platform.toUpperCase()}</p>

          <div className="mt-8 grid gap-6 text-left sm:grid-cols-3 sm:items-end">
            <dl>
              <dt className="text-xs font-semibold uppercase tracking-wider paper-muted">{t("issued")}</dt>
              <dd className="mt-1 font-semibold" data-cert-date>{f.dateTime(new Date(cert.issuedAt), { dateStyle: "long" })}</dd>
            </dl>
            <div className="flex justify-center" aria-hidden>
              <span className="grid size-20 place-items-center rounded-full border-4 paper-line paper-accent"><Award className="size-9" /></span>
            </div>
            <dl className="sm:text-right">
              <dt className="text-xs font-semibold uppercase tracking-wider paper-muted">{t("number")}</dt>
              <dd className="mt-1 font-mono font-semibold tracking-wide" data-cert-number>{cert.number}</dd>
            </dl>
          </div>

          <div className="mt-8 flex flex-col items-center gap-1 border-t paper-line pt-4 text-xs paper-muted">
            <p className="font-semibold">{t("signature")}</p>
            <p className="max-w-2xl text-pretty">{t("disclaimer")}</p>
            {isDemoMode ? <p>{t("demo")}</p> : null}
          </div>

          {revoked ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className={cn("-rotate-12 rounded-lg border-4 px-6 py-2 text-3xl font-extrabold uppercase tracking-widest sm:text-5xl", "border-[#c8102e] text-[#c8102e] opacity-70")}>{t("revoked")}</span>
            </div>
          ) : null}
        </div>
      </div>
      {revoked ? <p role="status" className="sr-only">{t("revoked")}</p> : null}
    </article>
  );
}
