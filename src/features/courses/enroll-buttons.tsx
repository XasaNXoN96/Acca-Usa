"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { platformTheme } from "@/lib/platform-theme";
import { isDemoMode } from "@/lib/app-mode";
import type { PlatformSlug } from "@/types";
import { enrollAction, leaveAction } from "./actions";

export function EnrollButton({ platform, size = "default", label, className, priceCents = 0, access }: {
  platform: PlatformSlug; size?: ButtonProps["size"]; label?: string; className?: string;
  /** > 0 → the platform is paid: the button starts a checkout instead of enrolling directly */
  priceCents?: number;
  access?: "FREE" | "ACTIVE" | "EXPIRED" | "REVOKED";
}) {
  const t = useTranslations("courses");
  const f = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<"failed" | "limited" | false>(false);
  if (access === "REVOKED") return <p role="status" className={`type-small font-medium text-destructive ${className ?? ""}`}>{t("revoked")}</p>;
  const paid = priceCents > 0;
  const price = f.number(priceCents / 100, { style: "currency", currency: "USD" });
  return (
    <div className={className}>
      <Button
        variant={platformTheme[platform].button}
        size={size}
        loading={pending}
        className="w-full"
        onClick={() =>
          start(async () => {
            setError(false);
            const res = await enrollAction(platform);
            if (res.ok && res.checkoutUrl) window.location.assign(res.checkoutUrl); // provider-hosted (or demo) checkout page
            else if (res.ok) router.refresh();
            else setError(res.code === "RATE_LIMITED" ? "limited" : "failed");
          })
        }
      >
        {pending ? t("enrolling") : (<><Plus aria-hidden />{paid ? (access === "EXPIRED" ? t("renewCta", { price }) : t("buyCta", { price })) : (label ?? (isDemoMode ? t("enrollCta") : t("enrollFreeCta")))}</>)}
      </Button>
      {error ? <p role="alert" className="type-caption mt-1.5 font-medium text-destructive">{error === "limited" ? t("rateLimited") : t("actionError")}</p> : null}
    </div>
  );
}

export function LeaveButton({ platform }: { platform: PlatformSlug }) {
  const t = useTranslations("courses");
  const c = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><LogOut aria-hidden />{t("leave")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("leaveTitle")}</DialogTitle>
          <DialogDescription>{t("leaveText")}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="type-small font-medium text-destructive">{t("actionError")}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{c("cancel")}</Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(false);
                const res = await leaveAction(platform);
                if (res.ok) {
                  setOpen(false);
                  router.refresh();
                } else setError(true);
              })
            }
          >
            {t("leave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
