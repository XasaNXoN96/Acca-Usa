"use client";

import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface PublicTopicRow {
  id: string;
  order: number;
  title: string;
  /** where the call-to-action leads (login with ?next=…, or the platform enrolment page) */
  href: string;
}

/**
 * Public course outline. Each row only knows its number, title and access state — it is given NO materials,
 * descriptions, tests or answers, so nothing protected can leak through this component.
 * Clicking a locked topic opens a dialog: sign in (or enroll) / cancel.
 */
export function PublicTopicAccordion({ topics, access, platformName }: { topics: PublicTopicRow[]; access: "login_required" | "enrollment_required"; platformName: string }) {
  const t = useTranslations("publicSubject");
  const c = useTranslations("common");
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {topics.map((topic) => (
        <li key={topic.id} data-topic-row="">
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={`${t("topicNumber", { number: pad(topic.order) })}: ${topic.title}. ${t("locked")}`}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold tabular-nums text-muted-foreground" aria-hidden>
                  {pad(topic.order)}
                </span>
                <span className="min-w-0 flex-1 text-pretty font-semibold leading-snug">{topic.title}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground" aria-hidden>
                  <Lock className="size-4" />
                  <span className="hidden sm:inline">{t("locked")}</span>
                  <ChevronRight className="size-4" />
                </span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Lock className="size-5 text-muted-foreground" aria-hidden />{t("dialogTitle")}</DialogTitle>
                <DialogDescription>
                  <span className="block font-semibold text-foreground">{t("topicNumber", { number: pad(topic.order) })}: {topic.title}</span>
                  <span className="mt-1 block">{access === "login_required" ? t("dialogLogin") : t("dialogEnroll", { platform: platformName })}</span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">{c("cancel")}</Button></DialogClose>
                <Button asChild>
                  <Link href={topic.href}>{access === "login_required" ? c("signIn") : t("enrollCta", { platform: platformName })}</Link>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </li>
      ))}
    </ul>
  );
}
