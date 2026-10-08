"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyTheme, getServerThemeSnapshot, getThemeSnapshot, setTheme, subscribeTheme } from "@/lib/theme-client";
import { isTheme, themes, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const icons = { light: Sun, dark: Moon, system: Monitor } as const;

function useTheme(): Theme {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  // While on "system", follow OS changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return theme;
}

/** Header dropdown: Light / Dark / System. The trigger icon is pure CSS so it is right on first paint. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const theme = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t("label")}>
          <Sun className="size-5 dark:hidden" aria-hidden />
          <Moon className="hidden size-5 dark:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => isTheme(v) && setTheme(v)}>
          {themes.map((k) => {
            const Icon = icons[k];
            return (
              <DropdownMenuRadioItem key={k} value={k}>
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{t(k)}</span>
                {k === theme ? <Check className="size-4" aria-hidden /> : null}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Segmented control for drawers. */
export function ThemeSegmented({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const theme = useTheme();
  return (
    <div role="group" aria-label={t("label")} className={cn("grid grid-cols-3 gap-1 rounded-xl bg-muted p-1", className)}>
      {themes.map((k) => {
        const Icon = icons[k];
        return (
          <button
            key={k}
            type="button"
            aria-pressed={theme === k}
            onClick={() => setTheme(k)}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors pointer-coarse:h-11",
              theme === k ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{t(k)}</span>
          </button>
        );
      })}
    </div>
  );
}
