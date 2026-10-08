"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/logo";
import { LanguageSegmented } from "@/components/layout/language-switcher";
import { ThemeSegmented } from "@/components/layout/theme-toggle";
import type { MegaPlatform } from "@/components/layout/mega-menu";
import { routes } from "@/lib/routes";
import { platformTheme } from "@/lib/platform-theme";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg border border-border px-1.5 text-center text-[0.8125rem] font-semibold leading-tight hover:bg-muted pointer-coarse:min-h-11";

/** Public-site drawer: search, compact single-row groups (qualifications, learn, account), language and theme. */
export function PublicMobileMenu({ platforms, home, homeLabel }: { platforms: MegaPlatform[]; home: string | null; homeLabel: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const activePlatform = platforms.find((p) => p.slug === active) ?? null;
  const [lastPath, setLastPath] = useState(pathname);
  // Close the drawer after navigation (derived-state pattern, no effect needed).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("common.openMenu")}>
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-describedby="mobile-menu-desc">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
          <SheetDescription id="mobile-menu-desc" className="sr-only">
            {t("nav.mobile")}
          </SheetDescription>
        </div>

        <nav aria-label={t("nav.mobile")} className="flex-1 space-y-3 overflow-y-auto p-3 pb-safe">
          <form action="/search" role="search" className="relative">
            <label htmlFor="mobile-search" className="sr-only">
              {t("common.search")}
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="mobile-search"
              name="q"
              type="search"
              placeholder={t("common.search")}
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base"
            />
          </form>

          <section aria-labelledby="mm-qual" className="space-y-1.5">
            <h2 id="mm-qual" className="type-eyebrow text-muted-foreground">{t("nav.qualifications")}</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {platforms.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  aria-pressed={active === p.slug}
                  aria-controls="mm-subjects"
                  onClick={() => setActive(active === p.slug ? null : p.slug)}
                  className={cn(chip, "gap-1.5", active === p.slug && "border-primary bg-muted")}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", platformTheme[p.slug].solid)} aria-hidden />
                  {p.name}
                </button>
              ))}
            </div>
            <div id="mm-subjects" aria-live="polite">
              {activePlatform ? (
                <div className="space-y-2 rounded-lg border border-border p-2.5">
                  <Link href={routes.platform(activePlatform.slug)} className={cn("block py-1 text-sm font-semibold", platformTheme[activePlatform.slug].text)}>
                    {t("mega.viewPlatform", { platform: activePlatform.name })}
                  </Link>
                  {activePlatform.levels.map((level) => (
                    <div key={level.id}>
                      <p className="type-eyebrow mb-0.5 text-muted-foreground">{level.name}</p>
                      <ul>
                        {level.subjects.map((s) => (
                          <li key={s.slug}>
                            <Link href={routes.subject(s.slug)} className="flex min-h-10 items-center gap-2 rounded-md px-1 text-sm">
                              <span className="min-w-9 font-bold text-muted-foreground">{s.code}</span>
                              <span className="truncate">{s.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="mm-learn" className="space-y-1.5">
            <h2 id="mm-learn" className="type-eyebrow text-muted-foreground">{t("nav.learn")}</h2>
            <div className="grid grid-cols-3 gap-1.5">
              <Link href={routes.books} className={chip}>{t("nav.books")}</Link>
              <Link href={routes.forums} className={chip}>{t("nav.forums")}</Link>
              <Link href={routes.search()} className={chip}>{t("nav.search")}</Link>
            </div>
          </section>

          <section aria-labelledby="mm-account" className="space-y-1.5">
            <h2 id="mm-account" className="type-eyebrow text-muted-foreground">{t("nav.account")}</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {home ? (
                <Link href={home} className={cn(chip, "col-span-3 border-primary bg-primary text-primary-foreground")}>{homeLabel}</Link>
              ) : (
                <>
                  <Link href={routes.login} className={chip}>{t("common.signIn")}</Link>
                  <Link href={routes.register} className={cn(chip, "border-primary bg-primary text-primary-foreground")}>{t("common.register")}</Link>
                  <Link href={routes.dashboard} className={chip}>{t("nav.dashboard")}</Link>
                </>
              )}
            </div>
          </section>

          <LanguageSegmented />
          <ThemeSegmented />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
