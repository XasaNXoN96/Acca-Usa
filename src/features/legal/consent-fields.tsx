"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { routes } from "@/lib/routes";

export type ConsentFieldKind = "terms" | "privacy" | "marketing";
const href = { terms: routes.terms, privacy: routes.privacy, marketing: routes.privacy } as const;

/**
 * One consent = one checkbox: never pre-ticked, never bundled with another purpose. The document opens in a new tab so the
 * form (and what was typed) is not lost. Server-side validation is the authority; this is the interface.
 */
export function ConsentCheckbox({ id, kind, checked, onChange, error }: { id: string; kind: ConsentFieldKind; checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  const t = useTranslations("legal.consent");
  const link = (chunks: React.ReactNode) => <Link href={href[kind]} target="_blank" rel="noopener noreferrer" className="-my-1 inline-block py-1 font-semibold text-primary underline-offset-2 hover:underline">{chunks}</Link>;
  return (
    <Field label="" htmlFor={id} error={error}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined} className="mt-0.5"
        />
        <label htmlFor={id} className="type-small cursor-pointer text-muted-foreground">
          {t.rich(`${kind}Label`, { doc: link })}
          {kind === "marketing" ? <span className="ml-1 text-xs">({t("optional")})</span> : null}
        </label>
      </div>
    </Field>
  );
}
