"use client";

import Link from "next/link";
import { ArrowRight, LogIn, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
 */
export function PublicTopicAccordion({ topics, access, platformName }: { topics: PublicTopicRow[]; access: "login_required" | "enrollment_required"; platformName: string }) {
  const t = useTranslations("publicSubject");
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Accordion type="single" collapsible className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {topics.map((topic) => (
        <AccordionItem key={topic.id} value={topic.id} data-topic-row="">
          <AccordionTrigger aria-label={`${t("topicNumber", { number: pad(topic.order) })}: ${topic.title}. ${t("locked")}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold tabular-nums text-muted-foreground" aria-hidden>
              {pad(topic.order)}
            </span>
            <span className="min-w-0 flex-1 text-pretty font-semibold leading-snug">{topic.title}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground" aria-hidden>
              <Lock className="size-4" />
              <span className="hidden sm:inline">{t("locked")}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-8">
              <div>
                <dt className="type-caption text-muted-foreground">{t("topicNumber", { number: pad(topic.order) })}</dt>
                <dd className="font-semibold">{topic.title}</dd>
              </div>
              <div className="sm:justify-self-end">
                <dt className="type-caption text-muted-foreground">{t("access")}</dt>
                <dd>
                  <Badge variant="outline" className="gap-1.5"><Lock aria-hidden />{t("locked")}</Badge>
                </dd>
              </div>
            </dl>
            <p className="type-small mt-3 text-muted-foreground">
              {access === "login_required" ? t("signInToOpen") : t("enrollToUnlock", { platform: platformName })}
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href={topic.href}>
                {access === "login_required" ? <LogIn aria-hidden /> : null}
                {access === "login_required" ? t("signInCta") : t("enrollCta", { platform: platformName })}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
