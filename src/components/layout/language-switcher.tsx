"use client";

import { useTransition } from "react";
import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeLabels, locales } from "@/i18n/config";
import { setLocaleAction } from "@/i18n/actions";
import { cn } from "@/lib/utils";

function useChangeLocale() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const change = (next: string) =>
    start(async () => {
      const res = await setLocaleAction(next);
      if (res.ok) router.refresh();
    });
  return { change, pending };
}

/** Compact dropdown for headers. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const { change, pending } = useChangeLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("gap-1.5 px-2.5", className)} aria-label={`${t("language")}: ${localeLabels[locale].short}`} disabled={pending}>
          <Globe aria-hidden />
          <span>{localeLabels[locale].short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={locale} onValueChange={change}>
          {locales.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              <span className="flex-1">{localeLabels[l].native}</span>
              {l === locale ? <Check className="size-4" aria-hidden /> : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Segmented control for drawers and forms. */
export function LanguageSegmented({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const { change, pending } = useChangeLocale();
  return (
    <div role="group" aria-label={t("language")} className={cn("grid grid-cols-3 gap-1 rounded-xl bg-muted p-1", className)}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          disabled={pending}
          aria-pressed={l === locale}
          onClick={() => change(l)}
          className={cn(
            "h-10 rounded-lg text-sm font-semibold transition-colors pointer-coarse:h-11",
            l === locale ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {localeLabels[l].short}
        </button>
      ))}
    </div>
  );
}
