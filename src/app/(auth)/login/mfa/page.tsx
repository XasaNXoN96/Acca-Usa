import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MfaChallengeForm } from "@/features/auth/mfa-forms";
import { getSession, pendingMfa } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.mfa");
  return { title: t("title") };
}

export default async function LoginMfaPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));
  if (!(await pendingMfa())) redirect(routes.login); // nothing to verify: password step first
  const t = await getTranslations("auth.mfa");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <MfaChallengeForm />
    </div>
  );
}
