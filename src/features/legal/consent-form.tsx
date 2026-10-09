"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { acceptConsentAction } from "./actions";
import { ConsentCheckbox } from "./consent-fields";

export function ConsentForm({ next }: { next?: string }) {
  const t = useTranslations("legal.consent");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="space-y-4">
      <form
        noValidate className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!terms || !privacy) return;
          start(async () => {
            setFailure(null);
            const res = await acceptConsentAction({ terms, privacy, marketing }, next);
            if (res.ok) { router.replace(res.redirectTo); router.refresh(); } else setFailure(t("failed"));
          });
        }}
      >
        {failure ? <Alert variant="destructive">{failure}</Alert> : null}
        <ConsentCheckbox id="consent-terms" kind="terms" checked={terms} onChange={setTerms} error={submitted && !terms ? t("termsRequired") : undefined} />
        <ConsentCheckbox id="consent-privacy" kind="privacy" checked={privacy} onChange={setPrivacy} error={submitted && !privacy ? t("privacyRequired") : undefined} />
        <ConsentCheckbox id="consent-marketing" kind="marketing" checked={marketing} onChange={setMarketing} />
        <Button type="submit" size="lg" className="w-full" loading={pending}>{t("continue")}</Button>
      </form>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" className="w-full">{t("signOut")}</Button>
      </form>
    </div>
  );
}
