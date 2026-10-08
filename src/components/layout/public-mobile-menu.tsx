"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Search } from "lucide-react";
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

/** Public-site drawer: search, platform accordions, links, language and auth actions. */
export function PublicMobileMenu({ platforms, home, homeLabel }: { platforms: MegaPlatform[]; home: string | null; homeLabel: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
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

        <nav aria-label={t("nav.mobile")} className="flex-1 space-y-4 overflow-y-auto p-4 pb-safe">
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
              className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base"
            />
          </form>

          <ul className="space-y-1">
            {platforms.map((p) => (
              <li key={p.slug}>
                <details className="group rounded-xl border border-border">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-full", platformTheme[p.slug].solid)} aria-hidden />
                      {p.name}
                    </span>
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-3 border-t border-border px-3 py-3">
                    <Link href={routes.platform(p.slug)} className={cn("block rounded-lg py-1.5 text-sm font-semibold", platformTheme[p.slug].text)}>
                      {t("mega.viewPlatform", { platform: p.name })}
                    </Link>
                    {p.levels.map((level) => (
                      <div key={level.id}>
                        <p className="type-eyebrow mb-1 text-muted-foreground">{level.name}</p>
                        <ul>
                          {level.subjects.map((s) => (
                            <li key={s.slug}>
                              <Link href={routes.subject(s.slug)} className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm">
                                <span className="min-w-9 font-bold text-muted-foreground">{s.code}</span>
                                <span className="truncate">{s.name}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            ))}
            <li>
              <Link href={routes.books} className="flex min-h-12 items-center rounded-xl px-3 font-semibold hover:bg-muted">
                {t("nav.books")}
              </Link>
            </li>
            <li>
              <Link href={routes.forums} className="flex min-h-12 items-center rounded-xl px-3 font-semibold hover:bg-muted">
                {t("nav.forums")}
              </Link>
            </li>
            <li>
              <Link href={routes.search()} className="flex min-h-12 items-center rounded-xl px-3 font-semibold hover:bg-muted">
                {t("nav.search")}
              </Link>
            </li>
          </ul>

          <LanguageSegmented />
          <ThemeSegmented />

          {home ? (
            <div className="pb-2">
              <Button asChild size="lg" className="w-full"><Link href={home}>{homeLabel}</Link></Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pb-2">
              <Button asChild variant="outline" size="lg">
                <Link href={routes.login}>{t("common.signIn")}</Link>
              </Button>
              <Button asChild size="lg">
                <Link href={routes.register}>{t("common.register")}</Link>
              </Button>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
