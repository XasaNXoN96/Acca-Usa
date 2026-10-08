import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "@/features/auth/auth-forms";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("submit") };
}

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));
  const t = await getTranslations("auth.register");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <RegisterForm />
      <p className="type-small text-center text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href={routes.login} className="font-semibold text-primary hover:underline">{t("loginLink")}</Link>
      </p>
    </div>
  );
}
