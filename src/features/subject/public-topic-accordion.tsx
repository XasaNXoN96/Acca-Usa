"use client";

import Link from "next/link";
import { FileText, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface PublicTopicRow {
  id: string;
  order: number;
  title: string;
  materials: { id: string; title: string }[];
}

/**
 * Public course outline: topics (accordion) → locked materials. Rows are given ONLY ids, numbers and titles — no files,
 * bodies, descriptions, tests or answers — so nothing protected can leak through this component.
 * Clicking a locked material opens a dialog: sign in (back to this page) or enroll / cancel.
 */
export function PublicTopicAccordion({
  topics,
  access,
  platformName,
  actionHref,
}: {
  topics: PublicTopicRow[];
  access: "login_required" | "enrollment_required";
  platformName: string;
  /** where the dialog's primary button leads: /login?next=<this page>, or the platform enrolment page */
  actionHref: string;
}) {
  const t = useTranslations("publicSubject");
  const c = useTranslations("common");
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Accordion type="single" collapsible className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {topics.map((topic) => (
        <AccordionItem key={topic.id} value={topic.id} data-topic-row="">
          <AccordionTrigger>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold tabular-nums text-muted-foreground" aria-hidden>
              {pad(topic.order)}
            </span>
            <span className="sr-only">: </span>
            <span className="min-w-0 flex-1 text-pretty font-semibold leading-snug">{topic.title}</span>
            <span className="sr-only">. </span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground" aria-hidden>
              <Lock className="size-4" />
              <span className="hidden sm:inline">{t("locked")}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {topic.materials.length === 0 ? (
              <p className="type-small text-muted-foreground">{t("noMaterials")}</p>
            ) : (
              <ul className="space-y-1.5" aria-label={t("materials")}>
                {topic.materials.map((m) => (
                  <li key={m.id} data-material-row="">
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${m.title}. ${t("locked")}`}
                          className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1 text-pretty font-medium leading-snug">{m.title}</span>
                          <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Lock className="size-5 text-muted-foreground" aria-hidden />
                            {t("dialogTitle")}
                          </DialogTitle>
                          <DialogDescription>
                            <span className="block font-semibold text-foreground">{m.title}</span>
                            <span className="mt-1 block">{access === "login_required" ? t("dialogLogin") : t("dialogEnroll", { platform: platformName })}</span>
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">{c("cancel")}</Button>
                          </DialogClose>
                          <Button asChild>
                            <Link href={actionHref}>{access === "login_required" ? c("signIn") : t("enrollCta", { platform: platformName })}</Link>
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </li>
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
