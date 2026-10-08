"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LeaveTestDialog({ open, onOpenChange, onLeave }: { open: boolean; onOpenChange: (o: boolean) => void; onLeave: () => void }) {
  const t = useTranslations("test.leave");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("text")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onLeave}>
            {t("leave")}
          </Button>
          <Button variant="navy" onClick={() => onOpenChange(false)} autoFocus>
            {t("stay")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubmitTestDialog({
  open,
  onOpenChange,
  unanswered,
  flagged,
  submitting,
  error,
  onReview,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  unanswered: number;
  flagged: number;
  submitting: boolean;
  error: boolean;
  onReview: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("test");
  return (
    <Dialog open={open} onOpenChange={(o) => (submitting ? undefined : onOpenChange(o))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("submitDialog.title")}</DialogTitle>
          <DialogDescription>{t("submitDialog.text")}</DialogDescription>
        </DialogHeader>
        {unanswered > 0 || flagged > 0 ? (
          <Alert variant="warning">
            <ul className="space-y-1">
              {unanswered > 0 ? <li>{t("submitDialog.unanswered", { count: unanswered })}</li> : null}
              {flagged > 0 ? <li>{t("submitDialog.flagged", { count: flagged })}</li> : null}
            </ul>
          </Alert>
        ) : null}
        {error ? <Alert variant="destructive">{t("submitError")}</Alert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onReview} disabled={submitting}>
            {t("submitDialog.review")}
          </Button>
          <Button onClick={onConfirm} loading={submitting} data-confirm-submit>
            {submitting ? t("submitting") : t("submitDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TimeUpDialog({ open }: { open: boolean }) {
  const t = useTranslations("test");
  return (
    <Dialog open={open}>
      <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("timeUpTitle")}</DialogTitle>
          <DialogDescription>{t("timeUpText")}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
