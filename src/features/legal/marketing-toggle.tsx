"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { setMarketingConsentAction } from "./actions";

export function MarketingToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("legal.settings");
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="pref-marketing" checked={on} disabled={pending} className="mt-0.5"
        onCheckedChange={(v) => {
          const next = v === true;
          setOn(next);
          start(async () => { const r = await setMarketingConsentAction(next); if (!r.ok) setOn(!next); setStatus(r.ok ? "saved" : "failed"); });
        }}
      />
      <div>
        <label htmlFor="pref-marketing" className="type-small cursor-pointer">{t("marketing")}</label>
        <p className="type-caption text-muted-foreground" role="status">{status === "saved" ? t("saved") : status === "failed" ? t("failed") : t("marketingHint")}</p>
      </div>
    </div>
  );
}
