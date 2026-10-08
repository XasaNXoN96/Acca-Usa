"use client";

import { useSyncExternalStore } from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { getCollapsedSnapshot, getServerCollapsedSnapshot, setSidebarPref, subscribeSidebar } from "@/lib/sidebar-client";

/**
 * Small round arrow on the sidebar's right edge. The arrow rotation is pure CSS (.sb-chevron follows
 * --sb-collapsed), so it is already correct on first paint; only aria state needs JS.
 */
export function SidebarToggle() {
  const t = useTranslations("nav");
  const collapsed = useSyncExternalStore(subscribeSidebar, getCollapsedSnapshot, getServerCollapsedSnapshot);
  const label = collapsed ? t("expandSidebar") : t("collapseSidebar");
  return (
    <button
      type="button"
      onClick={() => setSidebarPref(collapsed ? "open" : "collapsed")}
      aria-label={label}
      aria-expanded={!collapsed}
      suppressHydrationWarning
      className="absolute -right-3 top-[4.75rem] z-50 grid size-6 place-items-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:bg-muted focus-visible:outline-offset-4"
    >
      <ChevronLeft className="sb-chevron size-3.5" aria-hidden />
    </button>
  );
}
