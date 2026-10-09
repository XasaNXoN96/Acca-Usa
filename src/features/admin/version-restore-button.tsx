"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { restoreMaterialVersionAction } from "./actions";

const EVENT = "acca:version-restore";
type Notice = { ok: boolean; text: string };

/** Page-level status line. It stays mounted when the list re-renders after a restore (the restored row disappears). */
export function RestoreNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    const on = (e: Event) => setNotice((e as CustomEvent<Notice>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!notice) return null;
  return <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "type-small font-medium text-success" : "type-small font-medium text-destructive"}>{notice.text}</p>;
}

export function VersionRestoreButton({ materialId, versionId, disabled }: { materialId: string; versionId: string; disabled?: boolean }) {
  const t = useTranslations("admin.versions");
  const tv = useTranslations("admin.validation");
  const router = useRouter();
  const [pending, start] = useTransition();
  const tell = (n: Notice) => window.dispatchEvent(new CustomEvent<Notice>(EVENT, { detail: n }));
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled || pending} onClick={() => {
      if (!window.confirm(t("confirm"))) return;
      start(async () => {
        const r = await restoreMaterialVersionAction(materialId, versionId);
        if (r.ok) { tell({ ok: true, text: t("restored") }); router.refresh(); }
        else tell({ ok: false, text: r.message ? (tv as unknown as (k: string) => string)(r.message) : tv("generic") });
      });
    }}>{pending ? t("restoring") : t("restore")}</Button>
  );
}
