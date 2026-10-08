"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronDown, CreditCard, LogOut, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/lib/routes";
import { logoutAction } from "@/features/auth/actions";

export function UserMenu({ name, email, showStudentLinks = true }: { name: string; email: string; showStudentLinks?: boolean }) {
  const t = useTranslations();
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-1.5 sm:px-2" aria-label={`${t("student.userMenu")}: ${name}`}>
          <Avatar className="size-8">
            <AvatarFallback aria-hidden data-initial={initial} className="before:content-[attr(data-initial)]" />
          </Avatar>
          <span className="hidden max-w-32 truncate text-left text-sm lg:block">
            <span className="block truncate font-semibold leading-tight">{name}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-semibold text-foreground">{name}</span>
          <span className="block font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showStudentLinks ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={routes.profile}>
                <User aria-hidden />
                {t("nav.profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={routes.payments}>
                <CreditCard aria-hidden />
                {t("nav.payments")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); start(() => logoutAction()); }} disabled={pending}>
          <LogOut aria-hidden />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
