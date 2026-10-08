"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { platformTheme } from "@/lib/platform-theme";
import type { PlatformSlug } from "@/types";
import { enrollAction, leaveAction } from "./actions";

export function EnrollButton({ platform, size = "default", label, className }: { platform: PlatformSlug; size?: ButtonProps["size"]; label?: string; className?: string }) {
  const t = useTranslations("courses");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
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
            if (res.ok) router.refresh();
            else setError(true);
          })
        }
      >
        {pending ? t("enrolling") : (<><Plus aria-hidden />{label ?? t("enrollCta")}</>)}
      </Button>
      {error ? <p role="alert" className="type-caption mt-1.5 font-medium text-destructive">{t("actionError")}</p> : null}
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
