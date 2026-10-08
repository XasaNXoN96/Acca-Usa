"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { completeDemoCheckoutAction } from "./actions";

type Outcome = "paid" | "failed" | "cancelled";

export function DemoCheckoutForm({ paymentId }: { paymentId: string }) {
  const t = useTranslations("payments.demo");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const run = (outcome: Outcome) =>
    start(async () => {
      setError(false);
      const res = await completeDemoCheckoutAction({ paymentId, outcome });
      if (res.ok) router.push(`/payments?${outcome === "paid" ? "paid" : outcome === "failed" ? "failed" : "cancelled"}=${encodeURIComponent(paymentId)}`);
      else setError(true);
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button loading={pending} onClick={() => run("paid")}>{t("pay")}</Button>
        <Button variant="outline" disabled={pending} onClick={() => run("failed")}>{t("fail")}</Button>
        <Button variant="ghost" disabled={pending} onClick={() => run("cancelled")}>{t("cancel")}</Button>
      </div>
      {error ? <p role="alert" className="type-small font-medium text-destructive">{t("error")}</p> : null}
    </div>
  );
}
