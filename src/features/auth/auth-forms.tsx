"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { PasswordField, TextField } from "@/components/ui/form-fields";
import {
  forgotSchema, loginSchema, registerSchema, resetSchema,
  type AuthErrorKey, type ForgotInput, type LoginInput, type RegisterInput, type ResetInput,
} from "@/lib/validators/auth";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction, type AuthResult } from "./actions";
import { PasswordRules } from "./password-rules";
import { routes } from "@/lib/routes";

function useErrorText() {
  const t = useTranslations("auth.errors");
  return (message?: string) => (message ? t(message as AuthErrorKey) : undefined);
}

/** Maps a server AuthResult failure to a translated message (never leaks which part was wrong). */
function useServerError() {
  const t = useTranslations("auth.serverErrors");
  return (res: Extract<AuthResult, { ok: false }>) => {
    switch (res.code) {
      case "INVALID_CREDENTIALS": return t("invalidCredentials");
      case "SUSPENDED": return t("suspended");
      case "EMAIL_TAKEN": return t("emailTaken");
      case "RATE_LIMITED": return t("rateLimited", { minutes: res.retryMinutes ?? 1 });
      case "INVALID_TOKEN": return t("invalidToken");
      default: return t("generic");
    }
  };
}

export interface DemoAccount { role: "STUDENT" | "TEACHER" | "ADMIN"; email: string; password: string }

export function LoginForm({ next, demoAccounts }: { next?: string; demoAccounts?: DemoAccount[] }) {
  const t = useTranslations("auth");
  const roles = useTranslations("admin.roles");
  const err = useErrorText();
  const serverError = useServerError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFailure(null);
      const res = await loginAction(values, next);
      if (res.ok) {
        router.replace(res.redirectTo);
        router.refresh();
      } else setFailure(serverError(res));
    }),
  );

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {failure ? <Alert variant="destructive">{failure}</Alert> : null}
        <TextField id="login-email" label={t("fields.email")} type="email" autoComplete="email" inputMode="email" required
          registration={form.register("email")} error={err(errors.email?.message)} />
        <PasswordField id="login-password" label={t("fields.password")} autoComplete="current-password" required
          registration={form.register("password")} error={err(errors.password?.message)} />
        <div className="text-right">
          <Link href={routes.forgotPassword} className="type-small font-semibold text-primary hover:underline">{t("login.forgot")}</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={pending}>{t("login.submit")}</Button>
      </form>

      {demoAccounts?.length ? (
        <section aria-labelledby="demo-accounts" className="space-y-2 rounded-xl border border-warning/30 bg-warning-soft p-3">
          <h2 id="demo-accounts" className="type-small flex items-center gap-1.5 font-semibold text-warning">
            <FlaskConical className="size-4" aria-hidden />
            {t("login.demoTitle")}
          </h2>
          <p className="type-caption text-muted-foreground">{t("login.demoText")}</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {demoAccounts.map((a) => (
              <li key={a.role}>
                <Button
                  type="button" variant="outline" size="sm" className="w-full"
                  onClick={() => { form.setValue("email", a.email, { shouldValidate: true }); form.setValue("password", a.password, { shouldValidate: true }); }}
                >
                  {roles(a.role)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const err = useErrorText();
  const serverError = useServerError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", terms: false },
  });
  const { errors } = form.formState;
  const terms = useWatch({ control: form.control, name: "terms" });
  const password = useWatch({ control: form.control, name: "password" });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFailure(null);
      const res = await registerAction(values, next);
      if (res.ok) {
        router.replace(res.redirectTo);
        router.refresh();
      } else setFailure(serverError(res));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {failure ? <Alert variant="destructive">{failure}</Alert> : null}
      <TextField id="reg-name" label={t("fields.name")} autoComplete="name" required registration={form.register("name")} error={err(errors.name?.message)} />
      <TextField id="reg-email" label={t("fields.email")} type="email" autoComplete="email" inputMode="email" required registration={form.register("email")} error={err(errors.email?.message)} />
      <PasswordField id="reg-password" label={t("fields.password")} autoComplete="new-password" required registration={form.register("password")} error={err(errors.password?.message)} />
      <PasswordRules value={password} />
      <PasswordField id="reg-confirm" label={t("fields.confirmPassword")} autoComplete="new-password" required registration={form.register("confirmPassword")} error={err(errors.confirmPassword?.message)} />

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
          <label htmlFor="reg-terms" className="type-small cursor-pointer text-muted-foreground">{t("fields.terms")}</label>
        </div>
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={pending}>{t("register.submit")}</Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const err = useErrorText();
  const serverError = useServerError();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<{ demoPath?: string } | null>(null);
  const form = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFailure(null);
      const res = await forgotPasswordAction(values);
      if (res.ok) setSent({ demoPath: res.demoResetPath });
      else setFailure(serverError({ ok: false, code: res.code, retryMinutes: res.retryMinutes }));
    }),
  );

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title={t("forgot.sentTitle")}>{t("forgot.sentText")}</Alert>
        {sent.demoPath ? (
          <Alert variant="warning" title={t("forgot.demoTitle")}>
            <p>{t("forgot.demoText")}</p>
            <Button asChild size="sm" className="mt-2"><Link href={sent.demoPath}>{t("forgot.demoCta")}</Link></Button>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {failure ? <Alert variant="destructive">{failure}</Alert> : null}
      <TextField id="forgot-email" label={t("fields.email")} type="email" autoComplete="email" inputMode="email" required
        registration={form.register("email")} error={err(errors.email?.message)} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>{t("forgot.submit")}</Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const err = useErrorText();
  const serverError = useServerError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<ResetInput>({ resolver: zodResolver(resetSchema), defaultValues: { token, password: "", confirmPassword: "" } });
  const { errors } = form.formState;
  const password = useWatch({ control: form.control, name: "password" });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFailure(null);
      const res = await resetPasswordAction(values);
      if (res.ok) router.replace(res.redirectTo);
      else setFailure(serverError(res));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {failure ? <Alert variant="destructive">{failure}</Alert> : null}
      <input type="hidden" {...form.register("token")} />
      <PasswordField id="reset-password" label={t("fields.newPassword")} autoComplete="new-password" required registration={form.register("password")} error={err(errors.password?.message)} />
      <PasswordRules value={password} />
      <PasswordField id="reset-confirm" label={t("fields.confirmPassword")} autoComplete="new-password" required registration={form.register("confirmPassword")} error={err(errors.confirmPassword?.message)} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>{t("reset.submit")}</Button>
    </form>
  );
}
