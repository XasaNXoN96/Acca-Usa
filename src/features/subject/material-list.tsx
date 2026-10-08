import Link from "next/link";
import { BookOpen, FileAudio, FileText, Image as ImageIcon, Paperclip, Presentation, StickyNote, Video } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { routes } from "@/lib/routes";
import type { Material, MaterialKind } from "@/types";

export const materialIcons = {
  video: Video, pdf: FileText, notes: StickyNote, audio: FileAudio, slides: Presentation, image: ImageIcon, file: Paperclip, book: BookOpen,
} as const satisfies Record<MaterialKind, unknown>;

export async function MaterialList({ materials }: { materials: Material[] }) {
  const t = await getTranslations("subject");
  if (materials.length === 0) return <EmptyState title={t("noMaterials")} />;
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {materials.map((m) => {
        const Icon = materialIcons[m.kind];
        const inner = (
          <>
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-soft text-navy">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{m.title}</span>
              <span className="type-caption block truncate text-muted-foreground">{m.meta}</span>
            </span>
            <Badge variant="outline">{t(`materialKinds.${m.kind}`)}</Badge>
          </>
        );
        const cls = "flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3";
        const href = m.topicId ? routes.subjectMaterial(m.subjectSlug, m.topicId, m.id) : m.fileId ? `/api/files/${encodeURIComponent(m.fileId)}` : null;
        return (
          <li key={m.id}>
            {href ? (
              <Link href={href} {...(m.topicId ? {} : { target: "_blank", rel: "noopener noreferrer" })} className={`${cls} transition-shadow hover:shadow-md`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
