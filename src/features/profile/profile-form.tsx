"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/form-fields";
import { profileSchema, type AuthErrorKey, type ProfileInput } from "@/lib/validators/auth";
import { localeLabels, locales } from "@/i18n/config";
import { saveProfileAction } from "./actions";

export function ProfileForm({ defaults }: { defaults: ProfileInput }) {
  const t = useTranslations("profilePage");
  const e = useTranslations("auth.errors");
  const se = useTranslations("auth.serverErrors");
  const c = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const err = (m?: string) => (m ? e(m as AuthErrorKey) : undefined);

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await saveProfileAction({ name: values.name, language: values.language });
      setSaved(res.ok);
      setFailed(!res.ok);
      if (res.ok) router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle as="h2">{t("details")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <TextField id="profile-name" label={t("fields.name")} autoComplete="name" required registration={form.register("name")} error={err(errors.name?.message)} />
          <TextField id="profile-email" label={t("fields.email")} type="email" autoComplete="email" readOnly hint={t("emailHint")} registration={form.register("email")} error={err(errors.email?.message)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">{t("preferences")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            id="profile-language"
            label={t("preferredLanguage")}
            registration={form.register("language")}
            error={err(errors.language?.message)}
            options={locales.map((l) => ({ value: l, label: localeLabels[l].native }))}
          />
        </CardContent>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        <Button type="submit" size="lg" loading={pending}>{c("saveChanges")}</Button>
        {saved ? <Alert variant="success">{t("saved")}</Alert> : null}
        {failed ? <Alert variant="destructive">{se("generic")}</Alert> : null}
      </div>
    </form>
  );
}
