import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/features/auth/auth-forms";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.forgot"))("title") };
}

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));
  const t = await getTranslations("auth.forgot");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ForgotPasswordForm />
      <p className="type-small text-center">
        <Link href={routes.login} className="font-semibold text-primary hover:underline">{t("back")}</Link>
      </p>
    </div>
  );
}
