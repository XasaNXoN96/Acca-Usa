import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { materialIcons } from "@/features/subject/material-list";
import { routes } from "@/lib/routes";
import type { Material } from "@/types";

/** Ordered list of the topic's materials; each opens the Material Viewer. Shows per-student completion. */
export async function TopicMaterialList({ subjectSlug, topicId, materials, completedIds }: { subjectSlug: string; topicId: string; materials: Material[]; completedIds: string[] }) {
  const [t, k] = await Promise.all([getTranslations("material"), getTranslations("subject.materialKinds")]);
  const done = materials.filter((m) => completedIds.includes(m.id)).length;
  return (
    <section aria-labelledby="topic-materials" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="topic-materials" className="type-h3">{t("materialsTitle")}</h2>
        {materials.length ? <Badge variant="navy">{t("materialsProgress", { done, total: materials.length })}</Badge> : null}
      </div>
      {materials.length === 0 ? (
        <p className="type-small text-muted-foreground">{t("noMaterials")}</p>
      ) : (
        <ol className="grid gap-2 sm:grid-cols-2">
          {materials.map((m, i) => {
            const Icon = materialIcons[m.kind];
            const isDone = completedIds.includes(m.id);
            return (
              <li key={m.id} data-material-item="">
                <Link
                  href={routes.subjectMaterial(subjectSlug, topicId, m.id)}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-soft text-navy"><Icon className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-pretty text-sm font-semibold leading-snug">{i + 1}. {m.title}</span>
                    <span className="type-caption block text-muted-foreground">{k(m.kind)}</span>
                  </span>
                  {isDone ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label={t("completed")} /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
