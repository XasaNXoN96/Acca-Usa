"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./actions";
import { cn } from "@/lib/utils";

/** Real sign-out: a server action clears the session cookie, then redirects to /login. */
export function LogoutButton({ className, variant = "outline" }: { className?: string; variant?: "outline" | "ghost" }) {
  const t = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant={variant} className={cn(className)} loading={pending} onClick={() => start(() => logoutAction())}>
      {pending ? null : <LogOut aria-hidden />}
      {t("signOut")}
    </Button>
  );
}
