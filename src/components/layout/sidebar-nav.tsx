"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navIcons } from "@/components/layout/nav-icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getCollapsedSnapshot, getServerCollapsedSnapshot, subscribeSidebar } from "@/lib/sidebar-client";
import { isActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface Props {
  items: NavItem[];
  /** Pre-translated labels keyed by NavItem.labelKey (resolved on the server). */
  labels: Record<string, string>;
  ariaLabel: string;
  /** dark = permanent navy sidebar; light = inside the mobile drawer. */
  tone?: "dark" | "light";
  /** called when a link is activated (the mobile drawer closes itself with it) */
  onNavigate?: () => void;
}

/**
 * Icons sit at a fixed x-offset in both sidebar states; only the label fades. When the sidebar is collapsed
 * (dark tone only) each item shows its name in a tooltip on hover, keyboard focus or long press.
 */
export function SidebarNav({ items, labels, ariaLabel, tone = "dark", onNavigate }: Props) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeSidebar, getCollapsedSnapshot, getServerCollapsedSnapshot);
  const dark = tone === "dark";

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={300}>
      <nav aria-label={ariaLabel}>
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = navIcons[item.icon];
            const active = isActive(pathname, item);
            const label = labels[item.labelKey] ?? item.labelKey;
            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "relative flex min-h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                  dark
                    ? active
                      ? "bg-white/20 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                    : active
                      ? "bg-navy-soft font-semibold text-navy"
                      : "text-foreground/85 hover:bg-muted",
                  dark && "focus-visible:outline-white",
                )}
              >
                {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary-on-dark" /> : null}
                <Icon className="size-[1.125rem] shrink-0" aria-hidden />
                <span className={cn("truncate", dark && "sb-label")}>{label}</span>
              </Link>
            );
            return (
              <li key={item.href}>
                {dark ? (
                  <Tooltip open={collapsed ? undefined : false}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </TooltipProvider>
  );
}
