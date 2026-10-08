"use client";

import { Controller, useWatch, type Control, type FieldValues, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { PasswordField, SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import { FileField } from "@/features/storage/file-field";
import type { UploadedFile } from "@/features/storage/upload-client";
import { cn } from "@/lib/utils";
import type { FieldDef } from "./resources";

export interface Option { value: string; label: string; group?: string }
export interface ResolvedField extends FieldDef { label: string; hint?: string; options?: Option[] }

interface Props {
  form: UseFormReturn<FieldValues>;
  fields: ResolvedField[];
  errorText: (code?: string) => string | undefined;
  initialFile?: UploadedFile;
  placeholder: string;
}

/** Renders the fields of one admin form from a declarative definition (kind → control). */
export function RecordFields({ form, fields, errorText, initialFile, placeholder }: Props) {
  const values = useWatch({ control: form.control }) as Record<string, unknown>;
  const errors = form.formState.errors;

  // Changing a parent select (e.g. subject) clears the dependent field (topic / questions).
  const childrenOf = (name: string) => fields.filter((f) => f.dependsOn === name);
  const parentRegistration = (f: ResolvedField) =>
    form.register(f.name, {
      onChange: () => childrenOf(f.name).forEach((c) => form.setValue(c.name, c.kind === "multiselect" ? [] : "", { shouldDirty: true })),
    });

  return (
    <>
      {fields.map((f) => {
        if (f.showIf) {
          const v = String(values[f.showIf.field] ?? "");
          if (f.showIf.in && !f.showIf.in.includes(v)) return null;
          if (f.showIf.notIn && f.showIf.notIn.includes(v)) return null;
        }
        const id = `f-${f.name}`;
        const error = errorText(errors[f.name]?.message as string | undefined);
        const common = { id, label: f.label, required: f.required, hint: f.hint, error };
        const options = (f.options ?? []).filter((o) => !f.dependsOn || !o.group || o.group === String(values[f.dependsOn] ?? ""));

        switch (f.kind) {
          case "textarea":
            return <TextareaField key={f.name} {...common} rows={f.name === "body" ? 8 : 4} registration={form.register(f.name)} />;
          case "select":
            return (
              <SelectField key={f.name} {...common} placeholder={placeholder} options={options.map(({ value, label }) => ({ value, label }))}
                registration={childrenOf(f.name).length ? parentRegistration(f) : form.register(f.name)} />
            );
          case "password":
            return <PasswordField key={f.name} {...common} autoComplete="new-password" registration={form.register(f.name)} />;
          case "number":
            return <TextField key={f.name} {...common} type="number" inputMode="numeric" registration={form.register(f.name)} />;
          case "email":
            return <TextField key={f.name} {...common} type="email" autoComplete="off" registration={form.register(f.name)} />;
          case "checkbox":
            return (
              <Controller key={f.name} control={form.control} name={f.name}
                render={({ field }) => (
                  <Field label="" htmlFor={id} hint={f.hint}>
                    <div className="flex items-center gap-3">
                      <Checkbox id={id} checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                      <label htmlFor={id} className="cursor-pointer text-sm font-medium">{f.label}</label>
                    </div>
                  </Field>
                )} />
            );
          case "multiselect":
            return (
              <Controller key={f.name} control={form.control} name={f.name}
                render={({ field }) => <MultiSelect {...common} options={options} value={(field.value as string[]) ?? []} onChange={field.onChange} />} />
            );
          case "file":
            return (
              <Controller key={f.name} control={form.control} name={f.name}
                render={({ field }) => (
                  <Field label={f.label} htmlFor={id} error={error} required={f.required}>
                    <FileField id={id} materialKind={String(values.kind ?? "")} value={String(field.value ?? "")} initialFile={initialFile}
                      onChange={field.onChange} invalid={!!error} describedBy={error ? `${id}-error` : undefined} />
                  </Field>
                )} />
            );
          default:
            return <TextField key={f.name} {...common} registration={form.register(f.name)} />;
        }
      })}
    </>
  );
}

function MultiSelect({ id, label, required, hint, error, options, value, onChange }: {
  id: string; label: string; required?: boolean; hint?: string; error?: string; options: Option[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const t = useTranslations("admin.table");
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <div id={id} role="group" aria-label={label} aria-describedby={error ? `${id}-error` : undefined}
        className={cn("max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-background p-2", error ? "border-destructive" : "border-input")}>
        {options.length === 0 ? <p className="type-small p-2 text-muted-foreground">{t("selectPlaceholder")}</p> : null}
        {options.map((o) => (
          <label key={o.value} className="flex min-h-10 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
            <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} className="mt-0.5" />
            <span className="min-w-0">{o.label}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

export type { Control };
