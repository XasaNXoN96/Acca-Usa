"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { TextField } from "@/components/ui/form-fields";
import { loginSchema, registerSchema, type AuthErrorKey, type LoginInput, type RegisterInput } from "@/lib/validators/auth";
import { loginAction, registerAction } from "./actions";
import { routes } from "@/lib/routes";

function useErrorText() {
  const t = useTranslations("auth.errors");
  return (message?: string) => (message ? t(message as AuthErrorKey) : undefined);
}

function NotConnectedNotice() {
  const t = useTranslations("auth");
  return (
    <Alert variant="info" title={t("notConnectedTitle")}>
      {t("notConnectedText")}{" "}
      <Link href={routes.dashboard} className="font-semibold text-primary underline-offset-4 hover:underline">
        {t("continueDemo")}
      </Link>
    </Alert>
  );
}

export function LoginForm() {
  const t = useTranslations("auth");
  const err = useErrorText();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await loginAction(values);
      setNotice(res.code === "NOT_CONNECTED");
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField id="login-email" label={t("fields.email")} type="email" autoComplete="email" inputMode="email" required
        registration={form.register("email")} error={err(errors.email?.message)} />
      <TextField id="login-password" label={t("fields.password")} type="password" autoComplete="current-password" required
        registration={form.register("password")} error={err(errors.password?.message)} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("login.submit")}
      </Button>
      {notice ? <NotConnectedNotice /> : null}
    </form>
  );
}

export function RegisterForm() {
  const t = useTranslations("auth");
  const err = useErrorText();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", terms: false },
  });
  const { errors } = form.formState;
  const terms = useWatch({ control: form.control, name: "terms" });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await registerAction(values);
      setNotice(res.code === "NOT_CONNECTED");
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField id="reg-name" label={t("fields.name")} autoComplete="name" required
        registration={form.register("name")} error={err(errors.name?.message)} />
      <TextField id="reg-email" label={t("fields.email")} type="email" autoComplete="email" inputMode="email" required
        registration={form.register("email")} error={err(errors.email?.message)} />
      <TextField id="reg-password" label={t("fields.password")} type="password" autoComplete="new-password" required
        hint={t("fields.passwordHint")} registration={form.register("password")} error={err(errors.password?.message)} />
      <TextField id="reg-confirm" label={t("fields.confirmPassword")} type="password" autoComplete="new-password" required
        registration={form.register("confirmPassword")} error={err(errors.confirmPassword?.message)} />

      <Field label="" htmlFor="reg-terms" error={err(errors.terms?.message)}>
        <div className="flex items-start gap-3">
          <Checkbox
            id="reg-terms"
            checked={terms}
            onCheckedChange={(v) => form.setValue("terms", v === true, { shouldValidate: form.formState.isSubmitted })}
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? "reg-terms-error" : undefined}
            className="mt-0.5"
          />
          <label htmlFor="reg-terms" className="type-small cursor-pointer text-muted-foreground">
            {t("fields.terms")}
          </label>
        </div>
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("register.submit")}
      </Button>
      {notice ? <NotConnectedNotice /> : null}
    </form>
  );
}
