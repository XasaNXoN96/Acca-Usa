"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navIcons } from "@/components/layout/nav-icons";
import { isActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Mobile bottom tab bar: 5 destinations, ≥56px tall touch targets, safe-area aware. */
export function BottomNav({ items, labels, ariaLabel }: { items: NavItem[]; labels: Record<string, string>; ariaLabel: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={ariaLabel}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = navIcons[item.icon];
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{labels[item.labelKey]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
