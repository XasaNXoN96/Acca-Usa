import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/layout/logo";
import { routes } from "@/lib/routes";

export async function SiteFooter() {
  const t = await getTranslations();
  const col = (title: string, links: { href: string; label: string }[]) => (
    <div>
      <h2 className="type-eyebrow mb-2 text-white/70 md:mb-3">{title}</h2>
      <ul className="space-y-0.5 md:space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-flex min-h-9 items-center text-[0.8125rem] leading-tight text-white/90 hover:text-white hover:underline md:text-sm">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="bg-surface-navy text-white">
      <div className="container-page grid grid-cols-3 gap-x-3 gap-y-6 py-8 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-10 md:py-12">
        <div className="col-span-3 space-y-2 md:col-span-1 md:space-y-3">
          <Logo tone="inverse" />
          <p className="type-small max-w-xs text-white/80">{t("footer.tagline")}</p>
        </div>
        {col(t("footer.qualifications"), [
          { href: routes.platform("acca"), label: t("nav.acca") },
          { href: routes.platform("fia"), label: t("nav.fia") },
        ])}
        {col(t("footer.learn"), [
          { href: routes.books, label: t("nav.books") },
          { href: routes.forums, label: t("nav.forums") },
          { href: routes.search(), label: t("nav.search") },
        ])}
        {col(t("footer.account"), [
          { href: routes.login, label: t("common.signIn") },
          { href: routes.register, label: t("common.register") },
          { href: routes.dashboard, label: t("nav.dashboard") },
        ])}
      </div>
      <div className="border-t border-white/15">
        <div className="container-page flex flex-col gap-2 py-5 text-white/75 md:flex-row md:items-center md:justify-between">
          <p className="type-caption max-w-3xl">{t("footer.disclaimer")}</p>
          <p className="type-caption md:text-right">
            {t("footer.copyright", { year: new Date().getUTCFullYear() })} · {t("footer.demoBuild")}
          </p>
        </div>
      </div>
    </footer>
  );
}
