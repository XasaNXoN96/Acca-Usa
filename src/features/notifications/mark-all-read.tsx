"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("notificationsPage");
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" onClick={() => start(() => markAllReadAction())} loading={pending} disabled={disabled}>
      <CheckCheck aria-hidden />
      {t("markAllRead")}
    </Button>
  );
}
