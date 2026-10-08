"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LanguageSegmented } from "@/components/layout/language-switcher";
import { ThemeSegmented } from "@/components/layout/theme-toggle";
import { LogoutButton } from "@/features/auth/logout-button";
import type { NavItem } from "@/lib/navigation";

export function MobileDrawer({
  items,
  labels,
  ariaLabel,
  homeHref,
  extraLinks,
}: {
  items: NavItem[];
  labels: Record<string, string>;
  ariaLabel: string;
  homeHref: string;
  extraLinks?: { href: string; label: string }[];
}) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("openMenu")} className="lg:hidden md:hidden">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby="app-drawer-desc">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <SheetTitle asChild>
            <div>
              <Logo href={homeHref} />
            </div>
          </SheetTitle>
          <SheetDescription id="app-drawer-desc" className="sr-only">
            {ariaLabel}
          </SheetDescription>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-3">
          <SidebarNav items={items} labels={labels} ariaLabel={ariaLabel} tone="light" />
          {extraLinks?.length ? (
            <ul className="space-y-1 border-t border-border pt-3">
              {extraLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="pb-safe space-y-3 border-t border-border p-4">
          <LanguageSegmented />
          <ThemeSegmented />
          <LogoutButton className="w-full" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
