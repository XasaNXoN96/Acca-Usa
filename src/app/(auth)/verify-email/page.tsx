import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sessionOrNull } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";
import { services } from "@/services";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.verifyEmail.page"))("title"), robots: { index: false } };
}

/** The link in the confirmation e-mail. Confirming is idempotent and single-use (a mail scanner opening the link first is harmless). */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const sp = await searchParams;
  const token = (Array.isArray(sp.token) ? sp.token[0] : sp.token) ?? "";
  const t = await getTranslations("auth.verifyEmail.page");
  const result = token.length >= 20 && token.length <= 200 ? await services.auth.confirmEmail(token) : { ok: false as const };
  const signedIn = !!(await sessionOrNull());
  return (
    <div className="space-y-5" data-verify-email-result={result.ok ? "ok" : "invalid"}>
      {result.ok
        ? <Alert variant="success" title={t("okTitle")}>{t("okText")}</Alert>
        : <Alert variant="destructive" title={t("badTitle")}>{t("badText")}</Alert>}
      <Button asChild className="w-full"><Link href={signedIn ? routes.dashboard : routes.login}>{signedIn ? t("signIn") : t("toLogin")}</Link></Button>
    </div>
  );
}
