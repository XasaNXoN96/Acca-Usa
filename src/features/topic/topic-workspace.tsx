"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileAudio, FileText, Presentation, StickyNote, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MediaPanel } from "./media-panel";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Material } from "@/types";

const tabs = [
  { id: "video", icon: Video },
  { id: "pdf", icon: FileText },
  { id: "notes", icon: StickyNote },
  { id: "audio", icon: FileAudio },
  { id: "slides", icon: Presentation },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function TopicWorkspace({
  title,
  description,
  keyPoints,
  materials,
  testId,
}: {
  title: string;
  description: string;
  keyPoints: string[];
  materials: Material[];
  testId: string | null;
}) {
  const t = useTranslations("topic");
  const [tab, setTab] = useState<TabId>("video");

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      {/* Outline (desktop): mirrors the tabs, plus the topic test */}
      <aside className="hidden lg:block">
        <Card className="p-3">
          <h2 className="type-eyebrow px-2 pb-2 pt-1 text-muted-foreground">{t("contents")}</h2>
          <ol className="space-y-0.5">
            {tabs.map(({ id, icon: Icon }, i) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? "true" : undefined}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors",
                    tab === id ? "bg-primary-soft font-semibold text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold text-muted-foreground" aria-hidden>
                    {i + 1}
                  </span>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{t(`tabs.${id}`)}</span>
                </button>
              </li>
            ))}
            {testId ? (
              <li className="pt-1">
                <Link href={routes.test(testId)} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold text-navy hover:bg-navy-soft">
                  <ClipboardCheck className="size-4" aria-hidden />
                  {t("takeTest")}
                </Link>
              </li>
            ) : null}
          </ol>
        </Card>
      </aside>

      <div className="min-w-0 space-y-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList aria-label={t("contents")}>
            {tabs.map(({ id, icon: Icon }) => (
              <TabsTrigger key={id} value={id}>
                <Icon aria-hidden />
                {t(`tabs.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          {(["video", "pdf", "audio", "slides"] as const).map((id) => (
            <TabsContent key={id} value={id}>
              <MediaPanel kind={id} title={title} materials={materials} />
            </TabsContent>
          ))}
          <TabsContent value="notes">
            <Card className="space-y-3 p-5">
              <h2 className="type-h3">{t("notesTitle")}</h2>
              <p className="text-muted-foreground">{t("notesText")}</p>
              <p>{description}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {keyPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          </TabsContent>
        </Tabs>

        <section aria-labelledby="about-topic" className="space-y-3">
          <h2 id="about-topic" className="type-h3">{t("about")}</h2>
          <p className="text-muted-foreground">{description}</p>
          <h3 className="type-small font-semibold">{t("keyPoints")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {keyPoints.map((p) => (
              <li key={p} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{p}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="topic-resources" className="space-y-3">
          <h2 id="topic-resources" className="type-h3">{t("resources")}</h2>
          {materials.length === 0 ? (
            <p className="type-small text-muted-foreground">{t("noResources")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {materials.map((m) => (
                <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{m.title}</span>
                  <span className="type-caption shrink-0 text-muted-foreground">{m.meta}</span>
                </li>
              ))}
            </ul>
          )}
          {testId ? (
            <Button asChild variant="navy" className="lg:hidden">
              <Link href={routes.test(testId)}>
                <ClipboardCheck aria-hidden />
                {t("takeTest")}
              </Link>
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
