"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelMfaAction, verifyMfaAction } from "./actions";

export function MfaChallengeForm() {
  const t = useTranslations("auth.mfa");
  const s = useTranslations("auth.serverErrors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setFailure(null);
      const res = await verifyMfaAction({ code });
      if (res.ok) { router.replace(res.redirectTo); router.refresh(); return; }
      if (res.code === "NO_CHALLENGE") { router.replace("/login"); return; }
      setFailure(res.code === "RATE_LIMITED" ? s("rateLimited", { minutes: res.retryMinutes ?? 1 }) : res.code === "INVALID_CODE" ? t("invalid") : s("generic"));
      setCode("");
    });
  };

  return (
    <div className="space-y-2">
    <form onSubmit={submit} noValidate className="space-y-4">
      {failure ? <Alert variant="destructive">{failure}</Alert> : null}
      <div className="space-y-1.5">
        <Label htmlFor="mfa-code">{t("code")}</Label>
        <Input id="mfa-code" name="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={24} />
        <p className="type-caption text-muted-foreground">{t("recoveryHint")}</p>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={code.trim().length < 6}>{t("submit")}</Button>
    </form>
    <form action={cancelMfaAction}>
      <Button type="submit" variant="ghost" size="sm" className="w-full">{t("cancel")}</Button>
    </form>
    </div>
  );
}
