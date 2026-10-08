"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navIcons } from "@/components/layout/nav-icons";
import { isActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface Props {
  items: NavItem[];
  /** Pre-translated labels keyed by NavItem.labelKey (resolved on the server). */
  labels: Record<string, string>;
  ariaLabel: string;
  /** dark = navy desktop sidebar; light = inside mobile drawer. */
  tone?: "dark" | "light";
  /** Icon-only on tablet (md) and full labels from lg. Ignored for the drawer. */
  /** called when a link is activated (the mobile drawer closes itself with it) */
  onNavigate?: () => void;
}

export function SidebarNav({ items, labels, ariaLabel, tone = "dark", onNavigate }: Props) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel}>
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = navIcons[item.icon];
          const active = isActive(pathname, item);
          const label = labels[item.labelKey] ?? item.labelKey;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={label}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                  tone === "dark"
                    ? active
                      ? "bg-white/15 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                    : active
                      ? "bg-navy-soft font-semibold text-navy"
                      : "text-foreground/85 hover:bg-muted",
                  tone === "dark" && "focus-visible:outline-white",
                )}
              >
                {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" /> : null}
                <Icon className="size-[1.125rem] shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
