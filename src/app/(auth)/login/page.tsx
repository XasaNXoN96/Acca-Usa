import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "@/features/auth/auth-forms";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/redirect";
import { isDemoMode } from "@/lib/app-mode";
import { demoCredentials } from "@/data/mock/people";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("submit") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session) redirect(safeNext(sp.next) ?? homeFor(session.user.role));

  const t = await getTranslations("auth");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="type-h1">{t("login.title")}</h1>
        <p className="type-small text-muted-foreground">{t("login.subtitle")}</p>
      </div>
      {sp.reset ? <Alert variant="success">{t("reset.success")}</Alert> : null}
      <LoginForm next={safeNext(sp.next) ?? undefined} demoAccounts={isDemoMode ? demoCredentials : undefined} />
      <p className="type-small text-center text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link href={safeNext(sp.next) ? `${routes.register}?next=${encodeURIComponent(safeNext(sp.next)!)}` : routes.register} className="font-semibold text-primary hover:underline">{t("login.registerLink")}</Link>
      </p>
    </div>
  );
}
