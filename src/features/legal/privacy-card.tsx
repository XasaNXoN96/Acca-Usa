import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { services } from "@/services";
import { LEGAL_VERSIONS } from "@/lib/legal/consent";
import { legalOperator } from "@/lib/legal/operator";
import { routes } from "@/lib/routes";
import { MarketingToggle } from "./marketing-toggle";

/** Profile → what the user accepted (versions and dates), the optional e-mail preference, and how to exercise data rights. */
export async function PrivacyCard({ userId }: { userId: string }) {
  const [t, locale, current] = await Promise.all([getTranslations("legal.settings"), getLocale(), services.consent.current(userId)]);
  const op = legalOperator();
  const date = (iso?: string) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "—");
  const row = (kind: "terms" | "privacy") => {
    const c = current[kind];
    return (
      <li key={kind} className="flex flex-wrap items-baseline justify-between gap-2" data-consent-kind={kind}>
        <span><Link href={kind === "terms" ? routes.terms : routes.privacy} className="inline-flex min-h-8 items-center font-semibold text-primary hover:underline">{t(`${kind}`)}</Link></span>
        <span className="type-caption text-muted-foreground">{c?.granted ? t("accepted", { version: c.version, date: date(c.at) }) : t("notAccepted")}{c?.granted && c.version !== LEGAL_VERSIONS[kind] ? ` · ${t("outdated")}` : ""}</span>
      </li>
    );
  };
  return (
    <Card data-privacy-card>
      <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">{row("terms")}{row("privacy")}</ul>
        <MarketingToggle initial={current.marketing?.granted === true} />
        <p className="type-small text-muted-foreground">{t("rights", { email: op.contactEmail ?? t("contactMissing") })}</p>
        <p className="type-caption flex flex-wrap gap-x-4"><Link href={routes.cookies} className="inline-flex min-h-8 items-center text-primary hover:underline">{t("cookies")}</Link><Link href={routes.refunds} className="inline-flex min-h-8 items-center text-primary hover:underline">{t("refunds")}</Link></p>
      </CardContent>
    </Card>
  );
}
