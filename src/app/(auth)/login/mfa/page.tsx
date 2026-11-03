import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MfaChallengeForm } from "@/features/auth/mfa-forms";
import { getSession, pendingMfa } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";
import { services } from "@/services";
import { telegramConfigured } from "@/services/telegram/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.mfa");
  return { title: t("title") };
}

export default async function LoginMfaPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));
  const pending = await pendingMfa();
  if (!pending) redirect(routes.login); // nothing to verify: password step first
  const telegram = telegramConfigured() && (await services.telegramAuth.status(pending.uid)).linked;
  const t = await getTranslations("auth.mfa");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <MfaChallengeForm telegram={telegram} />
    </div>
  );
}
