import * as React from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { UserMenu } from "@/components/layout/user-menu";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { DemoBanner } from "@/components/layout/demo-banner";
import type { NavItem } from "@/lib/navigation";
import { routes } from "@/lib/routes";

interface AppShellProps {
  variant: "student" | "admin";
  items: NavItem[];
  labels: Record<string, string>;
  bottomItems?: NavItem[];
  user: { name: string; email: string };
  unreadNotifications?: number;
  demoMessage?: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the student and admin areas.
 *  - ≥lg  : full navy sidebar (labels)
 *  - md   : compact icon rail
 *  - <md  : top bar + drawer + (student) bottom tab bar
 */
export async function AppShell({ variant, items, labels, bottomItems, user, unreadNotifications = 0, demoMessage, children }: AppShellProps) {
  const t = await getTranslations();
  const homeHref = variant === "admin" ? routes.admin : routes.dashboard;
  const navLabel = variant === "admin" ? t("nav.admin") : t("nav.student");
  const hasBottom = variant === "student" && !!bottomItems;

  return (
    <div className="min-h-dvh bg-app">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[4.5rem] flex-col bg-navy text-white md:flex lg:w-60">
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-white/10 px-3 lg:justify-start lg:px-5">
          <Logo tone="inverse" href={homeHref} stacked className="lg:hidden" />
          <Logo tone="inverse" href={homeHref} className="hidden lg:inline-flex" />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-4 lg:px-3">
          <SidebarNav items={items} labels={labels} ariaLabel={navLabel} collapsible />
        </div>
        <div className="space-y-1 border-t border-white/10 p-2.5 lg:p-3">
          {variant === "admin" ? (
            <Link href={routes.dashboard} className="flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white lg:justify-start lg:text-sm">
              <span className="truncate">{t("nav.studentArea")}</span>
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="md:pl-[4.5rem] lg:pl-60">
        <div className="sticky top-0 z-30">
          <DemoBanner message={demoMessage} />
          <header className="flex h-16 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-5">
            <div className="md:hidden">
              <MobileDrawer
                items={items}
                labels={labels}
                ariaLabel={navLabel}
                homeHref={homeHref}
                extraLinks={
                  variant === "student"
                    ? [
                        { href: routes.books, label: t("nav.books") },
                        { href: routes.forums, label: t("nav.forums") },
                        { href: routes.search(), label: t("nav.search") },
                      ]
                    : [{ href: routes.dashboard, label: t("nav.studentArea") }]
                }
              />
            </div>
            <Logo href={homeHref} className="md:hidden" />

            {variant === "student" ? (
              <form action={routes.search()} role="search" className="relative ml-2 hidden max-w-md flex-1 md:block">
                <label htmlFor="app-search" className="sr-only">{t("common.search")}</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="app-search"
                  name="q"
                  type="search"
                  placeholder={t("common.searchPlaceholder")}
                  className="h-10 w-full rounded-lg border border-border bg-muted/60 pl-9 pr-3 text-sm placeholder:text-subtle-foreground focus-visible:bg-background"
                />
              </form>
            ) : (
              <p className="ml-2 hidden text-sm font-semibold text-muted-foreground md:block">{t("nav.adminPanel")}</p>
            )}

            <div className="ml-auto flex items-center gap-1">
              <LanguageSwitcher className="hidden sm:inline-flex" />
              {variant === "student" ? (
                <Button asChild variant="ghost" size="icon" className="relative">
                  <Link href={routes.notifications} aria-label={t("dashboard.notifications", { count: unreadNotifications })}>
                    <Bell className="size-5" aria-hidden />
                    {unreadNotifications > 0 ? (
                      <span aria-hidden className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-bold leading-4 text-white">
                        {unreadNotifications}
                      </span>
                    ) : null}
                  </Link>
                </Button>
              ) : null}
              <UserMenu name={user.name} email={user.email} showStudentLinks={variant === "student"} />
            </div>
          </header>
        </div>

        <main id="main" tabIndex={-1} className={hasBottom ? "pb-bottomnav outline-none" : "outline-none"}>
          <div className="container-page max-w-[88rem] space-y-6 py-6 sm:py-8">{children}</div>
        </main>
      </div>

      {hasBottom ? <BottomNav items={bottomItems} labels={labels} ariaLabel={t("nav.mobile")} /> : null}
    </div>
  );
}
