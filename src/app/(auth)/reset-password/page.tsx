import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.reset"))("title") };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const sp = await searchParams;
  const token = (Array.isArray(sp.token) ? sp.token[0] : sp.token) ?? "";
  const t = await getTranslations("auth.reset");
  // The token itself is validated (hash, expiry, single use) by the server action on submit.
  if (token.length < 20) {
    return (
      <div className="space-y-5">
        <Alert variant="destructive" title={t("invalidTitle")}>{t("invalidText")}</Alert>
        <Button asChild className="w-full"><Link href={routes.forgotPassword}>{t("requestNew")}</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
