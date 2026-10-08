"use client";

import * as React from "react";
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
