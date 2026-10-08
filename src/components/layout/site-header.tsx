import Link from "next/link";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { DemoModeBadge } from "@/components/layout/demo-mode-badge";
import { MegaMenuNav, type MegaPlatform } from "@/components/layout/mega-menu";
import { PublicMobileMenu } from "@/components/layout/public-mobile-menu";
import { services } from "@/services";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";

async function loadMegaPlatforms(): Promise<MegaPlatform[]> {
  const [platforms, subjects] = await Promise.all([services.platforms.list(), services.subjects.list()]);
  return platforms.map((p) => ({
    slug: p.slug,
    name: p.name,
    fullName: p.fullName,
    levels: p.levels.map((l) => ({
      id: l.id,
      name: l.name,
      subjects: subjects.filter((s) => s.levelId === l.id).map((s) => ({ slug: s.slug, code: s.code, name: s.name })),
    })),
  }));
}

export async function SiteHeader() {
  const [t, n, platforms, session] = await Promise.all([getTranslations("common"), getTranslations("nav"), loadMegaPlatforms(), getSession()]);
  const home = session ? homeFor(session.user.role) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="container-page flex h-16 items-center gap-3 lg:gap-5">
        <Logo className="shrink-0" />
        <MegaMenuNav platforms={platforms} />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <form action="/search" role="search" className="relative hidden xl:block">
            <label htmlFor="header-search" className="sr-only">
              {t("search")}
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="header-search"
              name="q"
              type="search"
              placeholder={t("search")}
              className="h-10 w-56 rounded-lg border border-border bg-muted/60 pl-9 pr-3 text-sm placeholder:text-subtle-foreground focus-visible:bg-background"
            />
          </form>

          <Button asChild variant="ghost" size="icon" className="xl:hidden" aria-label={t("search")}>
            <Link href={routes.search()}>
              <Search className="size-5" aria-hidden />
            </Link>
          </Button>

          <DemoModeBadge className="hidden 2xl:inline-flex" />
          <ThemeToggle className="hidden sm:inline-flex" />
          <LanguageSwitcher className="hidden sm:inline-flex" />
          {home ? (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href={home}>{session?.user.role === "STUDENT" ? n("dashboard") : n("adminPanel")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
                <Link href={routes.login}>{t("signIn")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href={routes.register}>{t("register")}</Link>
              </Button>
            </>
          )}
          <PublicMobileMenu platforms={platforms} home={home} homeLabel={session?.user.role === "STUDENT" ? n("dashboard") : n("adminPanel")} />
        </div>
      </div>
    </header>
  );
}
