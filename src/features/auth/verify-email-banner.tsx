"use client";

import { useState, useTransition } from "react";
import { MailWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "./actions";

/** Shown on every student page until the owner of the address has clicked the link in the confirmation e-mail. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useTranslations("auth.verifyEmail.banner");
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "sent" | "limited" | "failed">("idle");
  return (
    <Alert variant="warning" data-verify-email-banner className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <MailWarning className="size-5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{t("text", { email })}</p>
        <Button type="button" size="sm" variant="outline" loading={pending} className="h-auto min-h-9 max-w-full whitespace-normal py-1.5 text-center"
          onClick={() => start(async () => { const r = await resendVerificationAction(); setState(r.ok ? "sent" : r.code === "RATE_LIMITED" ? "limited" : "failed"); })}>
          {t("resend")}
        </Button>
      </div>
      {state !== "idle" ? <p role="status" className="type-caption mt-2">{state === "sent" ? t("sent") : state === "limited" ? t("limited") : t("failed")}</p> : null}
    </Alert>
  );
}
