"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sendTestEmailAction } from "./actions";

/** Sends one real test message to the administrator's own address and reports the provider's real answer. */
export function SendTestEmailButton() {
  const t = useTranslations("admin.settings.email");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ kind: "success" | "destructive" | "info"; text: string } | null>(null);
  const known = ["AUTH", "CONNECTION", "TIMEOUT", "TEMPORARY", "REJECTED_RECIPIENT", "REJECTED_MESSAGE", "UNKNOWN", "INVALID_RECIPIENT", "RENDER", "PROVIDER_ERROR"];
  const codeLabel = (c: string) => (known.includes(c) ? (t as unknown as (k: string) => string)(`codes.${c}`) : c);
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
        setResult(null);
        const r = await sendTestEmailAction();
        if (r.ok) setResult({ kind: r.demo ? "info" : "success", text: r.demo ? t("demoOk") : t("ok") });
        else setResult({ kind: "destructive", text: r.code === "LIMIT" ? t("limit") : r.code === "FORBIDDEN" ? t("forbidden") : t("failedWith", { code: codeLabel(r.code) }) });
      })}>{pending ? t("sending") : t("send")}</Button>
      {result ? <Alert variant={result.kind} data-testmail-result={result.kind}>{result.text}</Alert> : null}
    </div>
  );
}
