"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField, TextField } from "@/components/ui/form-fields";
import { localeLabels, locales } from "@/i18n/config";

const schema = z.object({
  siteName: z.string().trim().min(2, "min").max(60, "min"),
  supportEmail: z.string().trim().min(1, "required").email("emailInvalid"),
  defaultLanguage: z.enum(["en", "ru", "uz"]),
  passMark: z.string().refine((v) => Number(v) >= 1 && Number(v) <= 100, "number"),
  sequential: z.boolean(),
  reminders: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function SettingsForm() {
  const t = useTranslations("admin.settings");
  const v = useTranslations("admin.validation");
  const c = useTranslations("common");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { siteName: "ACCA USA", supportEmail: "support@example.com", defaultLanguage: "en", passMark: "70", sequential: true, reminders: false },
  });
  const { errors } = form.formState;
  const sequential = useWatch({ control: form.control, name: "sequential" });
  const reminders = useWatch({ control: form.control, name: "reminders" });
  const err = (m?: string) => (m === "min" ? v("min", { min: 2 }) : m === "required" ? v("required") : m === "emailInvalid" ? v("emailInvalid") : m === "number" ? v("number", { min: 1, max: 100 }) : undefined);

  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      await new Promise((r) => setTimeout(r, 250));
      setSaved(true);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle as="h2">{t("general")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <TextField id="s-name" label={t("siteName")} registration={form.register("siteName")} error={err(errors.siteName?.message)} required />
          <TextField id="s-email" label={t("supportEmail")} type="email" registration={form.register("supportEmail")} error={err(errors.supportEmail?.message)} required />
          <SelectField id="s-lang" label={t("defaultLanguage")} registration={form.register("defaultLanguage")} options={locales.map((l) => ({ value: l, label: localeLabels[l].native }))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">{t("learning")}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <TextField id="s-pass" label={t("passMark")} type="number" inputMode="numeric" registration={form.register("passMark")} error={err(errors.passMark?.message)} required />
          <CheckRow id="s-seq" label={t("sequential")} hint={t("sequentialHint")} checked={sequential} onChange={(x) => form.setValue("sequential", x)} />
          <CheckRow id="s-rem" label={t("reminders")} hint={t("remindersHint")} checked={reminders} onChange={(x) => form.setValue("reminders", x)} />
        </CardContent>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        <Button type="submit" size="lg" loading={pending}>{c("saveChanges")}</Button>
        {saved ? <Alert variant="success">{t("saved")}</Alert> : null}
      </div>
    </form>
  );
}

function CheckRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(x) => onChange(x === true)} aria-describedby={`${id}-hint`} className="mt-0.5" />
      <div className="space-y-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</label>
        <p id={`${id}-hint`} className="type-caption text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
