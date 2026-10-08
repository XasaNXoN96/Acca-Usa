"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileAudio, FileText, Presentation, StickyNote, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { MaterialCard, fileUrl } from "./material-viewers";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Material, MaterialKind } from "@/types";

const tabs = [
  { id: "video", icon: Video, kinds: ["video"] },
  { id: "pdf", icon: FileText, kinds: ["pdf", "book"] },
  { id: "notes", icon: StickyNote, kinds: ["notes"] },
  { id: "audio", icon: FileAudio, kinds: ["audio"] },
  { id: "slides", icon: Presentation, kinds: ["slides"] },
] as const satisfies readonly { id: string; icon: unknown; kinds: readonly MaterialKind[] }[];
type TabId = (typeof tabs)[number]["id"];

export function TopicWorkspace({
  description,
  keyPoints,
  materials,
  testId,
}: {
  description: string;
  keyPoints: string[];
  materials: Material[];
  testId: string | null;
}) {
  const t = useTranslations("topic");
  const k = useTranslations("subject.materialKinds");
  const [tab, setTab] = useState<TabId>("video");
  const downloads = materials.filter((m) => m.fileId);
  const count = (id: TabId) => materials.filter((m) => (tabs.find((x) => x.id === id)!.kinds as readonly string[]).includes(m.kind)).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
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
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold text-muted-foreground" aria-hidden>{i + 1}</span>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t(`tabs.${id}`)}</span>
                  <span className="type-caption tabular-nums text-muted-foreground">{count(id)}</span>
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

          {tabs.map(({ id, kinds }) => {
            const list = materials.filter((m) => (kinds as readonly string[]).includes(m.kind));
            return (
              <TabsContent key={id} value={id} className="space-y-4">
                {list.length === 0 ? (
                  <EmptyState
                    title={t("noMaterialOfKind", { kind: k(kinds[0]).toLowerCase() })}
                    description={id === "notes" ? t("notesEmpty") : undefined}
                  />
                ) : (
                  list.map((m) => <MaterialCard key={m.id} material={m} />)
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        <section aria-labelledby="about-topic" className="space-y-3">
          <h2 id="about-topic" className="type-h3">{t("about")}</h2>
          <p className="text-muted-foreground">{description}</p>
          {keyPoints.length ? (
            <>
              <h3 className="type-small font-semibold">{t("keyPoints")}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {keyPoints.map((p) => (
                  <li key={p} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{p}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section aria-labelledby="topic-resources" className="space-y-3">
          <h2 id="topic-resources" className="type-h3">{t("resources")}</h2>
          {downloads.length === 0 ? (
            <p className="type-small text-muted-foreground">{t("noResources")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {downloads.map((m) => (
                <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{m.title}</span>
                  <a href={fileUrl(m.fileId!, true)} className="shrink-0 rounded-md px-2 py-1 font-semibold text-primary hover:underline">{t("download")}</a>
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
