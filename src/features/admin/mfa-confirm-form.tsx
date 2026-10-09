"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmMfaAction } from "./security-actions";
import { useShowRecoveryCodes } from "./recovery-host";

export function MfaConfirmForm() {
  const t = useTranslations("admin.security");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const show = useShowRecoveryCodes();

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setFailure(null);
          const res = await confirmMfaAction({ code });
          if (res.ok) { show(res.recoveryCodes); router.refresh(); return; }
          setFailure(res.code === "INVALID_CODE" ? t("invalidCode") : res.code === "RATE_LIMITED" ? t("rateLimited", { minutes: res.retryMinutes ?? 1 }) : t("failed"));
          setCode("");
        });
      }}
    >
      {failure ? <Alert variant="destructive">{failure}</Alert> : null}
      <div className="space-y-1.5">
        <Label htmlFor="mfa-confirm">{t("codeLabel")}</Label>
        <Input id="mfa-confirm" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={10} required />
      </div>
      <Button type="submit" loading={pending} disabled={code.replace(/\D/g, "").length !== 6}>{t("confirm")}</Button>
    </form>
  );
}
