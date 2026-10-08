"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";

interface BaseProps {
  id: string;
  label: string;
  error?: FieldError | string;
  hint?: string;
  required?: boolean;
  registration: UseFormRegisterReturn;
  className?: string;
}

/** `error` may already be translated text. Wiring aria-* here keeps every form consistent. */
function a11y(id: string, error: boolean, hint?: string) {
  return {
    id,
    "aria-invalid": error || undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}
const text = (e?: FieldError | string) => (typeof e === "string" ? e : e?.message);

export function TextField({
  registration,
  id,
  label,
  error,
  hint,
  required,
  className,
  ...input
}: BaseProps & Omit<React.ComponentProps<"input">, "id" | "className">) {
  return (
    <Field label={label} htmlFor={id} error={text(error)} hint={hint} required={required} className={className}>
      <Input {...input} {...registration} {...a11y(id, !!error, hint)} />
    </Field>
  );
}

export function TextareaField({
  registration,
  id,
  label,
  error,
  hint,
  required,
  className,
  ...rest
}: BaseProps & Omit<React.ComponentProps<"textarea">, "id" | "className">) {
  return (
    <Field label={label} htmlFor={id} error={text(error)} hint={hint} required={required} className={className}>
      <Textarea {...rest} {...registration} {...a11y(id, !!error, hint)} />
    </Field>
  );
}

export function SelectField({
  registration,
  id,
  label,
  error,
  hint,
  required,
  className,
  options,
  placeholder,
}: BaseProps & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} htmlFor={id} error={text(error)} hint={hint} required={required} className={className}>
      <Select {...registration} {...a11y(id, !!error, hint)} defaultValue="">
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Password input with a show/hide toggle (keyboard + screen-reader accessible). */
export function PasswordField({
  registration,
  id,
  label,
  error,
  hint,
  required,
  className,
  autoComplete,
}: BaseProps & { autoComplete: "current-password" | "new-password" }) {
  const t = useTranslations("common");
  const [visible, setVisible] = React.useState(false);
  return (
    <Field label={label} htmlFor={id} error={text(error)} hint={hint} required={required} className={className}>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          className="pr-12"
          {...registration}
          {...a11y(id, !!error, hint)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground pointer-coarse:size-11"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </Field>
  );
}
