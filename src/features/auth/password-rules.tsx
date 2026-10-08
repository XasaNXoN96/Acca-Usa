"use client";

import { Check, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Live checklist next to the password field — same rules as the Zod schema. */
export function PasswordRules({ value }: { value: string }) {
  const t = useTranslations("auth.passwordRules");
  const rules = [
    { key: "length", ok: value.length >= 8 },
    { key: "letter", ok: /[A-Za-z]/.test(value) },
    { key: "number", ok: /\d/.test(value) },
  ] as const;
  return (
    <ul aria-label={t("title")} className="type-caption grid gap-1 text-muted-foreground sm:grid-cols-3">
      {rules.map((r) => (
        <li key={r.key} className={cn("flex items-center gap-1.5", r.ok && "text-success")}>
          {r.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
          <span>{t(r.key)}</span>
          <span className="sr-only">{r.ok ? t("met") : t("notMet")}</span>
        </li>
      ))}
    </ul>
  );
}
