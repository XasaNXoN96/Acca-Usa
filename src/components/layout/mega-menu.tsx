"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, BookOpen, ChevronDown, ClipboardList, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PlatformMark } from "@/components/layout/platform-mark";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { platformTheme } from "@/lib/platform-theme";
import type { PlatformSlug } from "@/types";

export interface MegaPlatform {
  slug: PlatformSlug;
  name: string;
  fullName: string;
  levels: { id: string; name: string; subjects: { slug: string; code: string; name: string }[] }[];
}

/**
 * Desktop navigation with full-width mega menus.
 * - hover (pointer) / click or Enter/Space on the chevron (touch + keyboard)
 * - Escape closes and returns focus; focus leaving the nav closes; route change closes
 * - the label itself stays a real link to the platform page
 */
export function MegaMenuNav({ platforms }: { platforms: MegaPlatform[] }) {
  const t = useTranslations();
  const pathname = usePathname();
  const baseId = useId();
  const [open, setOpen] = useState<PlatformSlug | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRefs = useRef<Partial<Record<PlatformSlug, HTMLButtonElement | null>>>({});
  const navRef = useRef<HTMLElement>(null);

  const clearTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const openNow = useCallback((slug: PlatformSlug) => {
    clearTimer();
    setOpen(slug);
  }, []);
  const closeSoon = useCallback(() => {
    clearTimer();
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  }, []);

  // Close whenever navigation happens (derived-state pattern — no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
  }

  useEffect(() => clearTimer, []);

  // Close on outside pointer down.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      const slug = open;
      setOpen(null);
      toggleRefs.current[slug]?.focus();
    }
  };

  const onBlur = (e: React.FocusEvent) => {
    if (!navRef.current?.contains(e.relatedTarget as Node | null)) setOpen(null);
  };

  const active = platforms.find((p) => p.slug === open);

  return (
    <nav
      ref={navRef}
      aria-label={t("nav.main")}
      className="hidden lg:block"
      onMouseLeave={closeSoon}
      onMouseEnter={clearTimer}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <ul className="flex items-center gap-0.5">
        {platforms.map((p) => {
          const isOpen = open === p.slug;
          const panelId = `${baseId}-${p.slug}`;
          const current = pathname === routes.platform(p.slug) || pathname.startsWith(`/${p.slug}/`);
          return (
            <li key={p.slug} className="relative" onMouseEnter={() => openNow(p.slug)}>
              <div
                className={cn(
                  "flex items-center rounded-lg transition-colors",
                  isOpen ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <Link
                  href={routes.platform(p.slug)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "rounded-l-lg py-2 pl-3 pr-1 text-sm font-semibold",
                    current ? "text-foreground" : "text-foreground/85",
                  )}
                >
                  {p.name}
                </Link>
                <button
                  ref={(el) => {
                    toggleRefs.current[p.slug] = el;
                  }}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={t("mega.viewPlatform", { platform: p.name })}
                  onClick={() => (isOpen ? setOpen(null) : openNow(p.slug))}
                  className="grid size-8 place-items-center rounded-r-lg text-muted-foreground"
                >
                  <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
        <li>
          <Link href={routes.books} className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground/85 hover:bg-muted/60">
            {t("nav.books")}
          </Link>
        </li>
        <li>
          <Link href={routes.forums} className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground/85 hover:bg-muted/60">
            {t("nav.forums")}
          </Link>
        </li>
      </ul>

      {platforms.map((p) => (
        <div
          key={p.slug}
          id={`${baseId}-${p.slug}`}
          hidden={active?.slug !== p.slug}
          className="absolute inset-x-0 top-full border-b border-border bg-background shadow-lg"
        >
          {active?.slug === p.slug ? <MegaPanel platform={p} /> : null}
        </div>
      ))}
    </nav>
  );
}

function MegaPanel({ platform }: { platform: MegaPlatform }) {
  const t = useTranslations();
  const theme = platformTheme[platform.slug];
  return (
    <div className="container-page max-h-[calc(100dvh-5rem)] overflow-y-auto py-6">
      <div className="grid gap-8 xl:grid-cols-[1fr_14rem_16rem]">
        <section aria-label={t("mega.levels")}>
          <div className={cn("grid gap-6", platform.levels.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
            {platform.levels.map((level) => (
              <div key={level.id}>
                <h3 className="type-eyebrow mb-3 text-muted-foreground">{level.name}</h3>
                <ul className="space-y-0.5">
                  {level.subjects.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={routes.subject(s.slug)}
                        className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className={cn("grid h-6 min-w-9 place-items-center rounded-md px-1.5 text-[0.7rem] font-bold", theme.soft, theme.text)}>
                          {s.code}
                        </span>
                        <span className="min-w-0 flex-1 line-clamp-2 text-[0.8125rem] font-medium leading-tight text-foreground/90 group-hover:text-foreground">{s.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-label={t("mega.resources")} className="hidden xl:block">
          <h3 className="type-eyebrow mb-3 text-muted-foreground">{t("mega.resources")}</h3>
          <ul className="space-y-0.5 text-sm">
            <ResourceLink href={routes.allCourses} icon={<BookOpen aria-hidden />}>
              {t("mega.allCourses", { platform: platform.name })}
            </ResourceLink>
            <ResourceLink href={routes.exams} icon={<ClipboardList aria-hidden />}>
              {t("mega.practiceTests")}
            </ResourceLink>
            <ResourceLink href={routes.books} icon={<BookOpen aria-hidden />}>
              {t("mega.books")}
            </ResourceLink>
            <ResourceLink href={routes.forums} icon={<MessagesSquare aria-hidden />}>
              {t("mega.forums")}
            </ResourceLink>
          </ul>
        </section>

        <aside className={cn("flex flex-col justify-between gap-4 rounded-xl border p-5", theme.soft, theme.border)}>
          <div className="space-y-2">
            <PlatformMark platform={platform.slug} />
            <p className="type-h3">{platform.fullName}</p>
            <p className="type-small text-muted-foreground">{t("mega.promoText")}</p>
          </div>
          <Button asChild variant={theme.button} size="sm" className="self-start">
            <Link href={routes.platform(platform.slug)}>
              {t("mega.viewPlatform", { platform: platform.name })}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}

function ResourceLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {children}
      </Link>
    </li>
  );
}
