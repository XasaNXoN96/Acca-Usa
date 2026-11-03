"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendSupportMessageAction, type SupportResult } from "./actions";

export function SupportForm({ defaultName = "", defaultEmail = "" }: { defaultName?: string; defaultEmail?: string }) {
  const t = useTranslations("support");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SupportResult | null>(null);
  const [v, setV] = useState({ name: defaultName, email: defaultEmail, message: "", website: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await sendSupportMessageAction(v);
      setResult(r);
      if (r.ok) setV((x) => ({ ...x, message: "" }));
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate data-support-form>
      {result?.ok ? <Alert variant="success" role="status">{t("sent")}</Alert> : null}
      {result && !result.ok ? <Alert variant="destructive" role="alert">{result.code === "RATE_LIMITED" ? t("limited") : result.code === "INVALID" ? t("invalid") : t("failed")}</Alert> : null}
      <div className="space-y-1.5"><Label htmlFor="sp-name">{t("name")}</Label><Input id="sp-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" maxLength={80} required /></div>
      <div className="space-y-1.5"><Label htmlFor="sp-email">{t("email")}</Label><Input id="sp-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" maxLength={254} required /><p className="type-caption text-muted-foreground">{t("emailHint")}</p></div>
      <div className="space-y-1.5">
        <Label htmlFor="sp-message">{t("message")}</Label>
        <textarea id="sp-message" value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} rows={6} maxLength={2000} required
          className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      {/* honeypot: hidden from people and assistive technology */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} /></label></div>
      <Button type="submit" size="lg" loading={pending} disabled={v.name.trim().length < 2 || v.message.trim().length < 10 || !v.email.includes("@")} className="w-full sm:w-auto"><Send aria-hidden />{t("send")}</Button>
    </form>
  );
}
