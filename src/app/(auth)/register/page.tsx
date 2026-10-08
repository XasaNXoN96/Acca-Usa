import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "@/features/auth/auth-forms";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";
import { safeNext } from "@/lib/auth/redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("submit") };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session) redirect(safeNext(sp.next) ?? homeFor(session.user.role));
  const t = await getTranslations("auth.register");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-small text-muted-foreground">{t("subtitle")}</p>
      </div>
      <RegisterForm next={safeNext(sp.next) ?? undefined} />
      <p className="type-small text-center text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href={safeNext(sp.next) ? `${routes.login}?next=${encodeURIComponent(safeNext(sp.next)!)}` : routes.login} className="font-semibold text-primary hover:underline">{t("loginLink")}</Link>
      </p>
    </div>
  );
}
