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
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { cookies } from "next/headers";
import { GraduationCap } from "lucide-react";
import { SIDEBAR_COOKIE, isSidebarPref } from "@/lib/sidebar";
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
 *  - ≥768px : permanent navy sidebar that the user can collapse to icons (arrow on its edge, state kept in a cookie);
 *             default is open from 1024px and collapsed on tablets; content reflows with a smooth transition
 *  - <768px : the sidebar does not fit → top bar Menu button opens it as a drawer (students also get the bottom tab bar)
 */
export async function AppShell({ variant, items, labels, bottomItems, user, unreadNotifications = 0, demoMessage, children }: AppShellProps) {
  const t = await getTranslations();
  const homeHref = variant === "admin" ? routes.admin : routes.dashboard;
  const navLabel = variant === "admin" ? t("nav.admin") : t("nav.student");
  const hasBottom = variant === "student" && !!bottomItems;
  const saved = (await cookies()).get(SIDEBAR_COOKIE)?.value;
  const pref = isSidebarPref(saved) ? saved : "auto";

  return (
    <div className="app-shell min-h-dvh bg-app" data-sidebar={pref}>
      <aside className="sb-aside fixed inset-y-0 left-0 z-40 hidden flex-col bg-surface-navy text-white md:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
          <div className="sb-hide-collapsed">
            <Logo tone="inverse" href={homeHref} />
          </div>
          <div className="sb-show-collapsed w-full justify-center">
            <Logo tone="inverse" href={homeHref} stacked />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          <SidebarNav items={items} labels={labels} ariaLabel={navLabel} />
        </div>
        {variant === "admin" ? (
          <div className="border-t border-white/10 p-3">
            <Link href={routes.dashboard} className="flex min-h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white">
              <GraduationCap className="size-[1.125rem] shrink-0" aria-hidden />
              <span className="sb-label truncate">{t("nav.studentArea")}</span>
            </Link>
          </div>
        ) : null}
        <SidebarToggle />
      </aside>

      <div className="sb-content">
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
              <ThemeToggle className="hidden sm:inline-flex" />
              <LanguageSwitcher className="hidden sm:inline-flex" />
              {variant === "student" || variant === "admin" ? (
                <Button asChild variant="ghost" size="icon" className="relative" data-bell>
                  <Link href={variant === "admin" ? routes.adminNotifications : routes.notifications} aria-label={t("dashboard.notifications", { count: unreadNotifications })}>
                    <Bell className="size-5" aria-hidden />
                    {unreadNotifications > 0 ? (
                      <span aria-hidden className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-bold leading-4 text-primary-foreground">
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
