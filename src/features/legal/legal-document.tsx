import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import type { LegalDocs } from "@/content/legal/types";
import { isLocale } from "@/i18n/config";
import { LEGAL_VERSIONS, type ConsentKind } from "@/lib/legal/consent";
import { legalOperator } from "@/lib/legal/operator";

/**
 * Renders one legal text in the visitor's language with the OPERATOR's details filled in. Details that are not configured are shown
 * as an explicit marker — the page never invents a company, address or number — and the draft notice stays until the operator
 * attests (LEGAL_TEXTS_REVIEWED=1) that counsel has reviewed the texts for their jurisdiction.
 */
export async function LegalDocument({ docs, kind }: { docs: LegalDocs; kind?: ConsentKind | "info" }) {
  const [t, locale] = await Promise.all([getTranslations("legal"), getLocale()]);
  const op = legalOperator();
  const missing = t("notConfigured");
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => {
      const map: Record<string, string | undefined> = { operator: op.name, address: op.address, taxId: op.taxId, contact: op.contactEmail, location: op.dataLocation, law: op.governingLaw, refundDays: op.refundWindow };
      return map[k] ?? missing;
    });
  const doc = docs[isLocale(locale) ? locale : "en"];
  const version = kind && kind !== "info" ? LEGAL_VERSIONS[kind] : LEGAL_VERSIONS.terms;
  return (
    <article className="container-page max-w-3xl space-y-6 py-10" data-legal-document>
      <PageHeader title={doc.title} description={t("version", { version })} />
      {op.reviewed ? null : <Alert variant="warning"><span data-legal-draft>{t("draftNotice")}</span></Alert>}
      <p className="type-body">{fill(doc.intro)}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="type-h3">{s.heading}</h2>
          {s.body.map((p, i) => <p key={i} className="type-body text-muted-foreground">{fill(p)}</p>)}
        </section>
      ))}
    </article>
  );
}
