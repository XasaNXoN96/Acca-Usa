import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConsentForm } from "@/features/legal/consent-form";
import { getSessionForConsent } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/redirect";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("legal.consent"))("title") };
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const loaded = await getSessionForConsent();
  if (!loaded) redirect(routes.login);
  if (!loaded.consentRequired) redirect(safeNext(sp.next) ?? homeFor(loaded.session.user.role));
  const t = await getTranslations("legal.consent");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ConsentForm next={safeNext(sp.next) ?? undefined} />
    </div>
  );
}
