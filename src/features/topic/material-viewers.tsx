import type { Material } from "@/types";
import { MaterialViewer } from "@/features/material/material-viewer";

export { fileUrl } from "@/lib/file-url";

/** One protected viewer implementation for the topic page AND the material page (no duplicated players). */
export function MaterialCard({ material, canDownload, watermark, fileInfo }: {
  material: Material; canDownload: boolean; watermark: string | null;
  fileInfo: { name: string; mime: string; sizeLabel: string; typeLabel: string } | null;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-semibold">{material.title}</h3>
        <span className="type-caption text-muted-foreground">{material.meta}</span>
      </header>
      <MaterialViewer
        material={{ id: material.id, title: material.title, kind: material.kind, fileId: material.fileId, body: material.body }}
        file={fileInfo ?? (material.fileId ? { name: material.title, mime: material.fileMime ?? "application/octet-stream", sizeLabel: "", typeLabel: material.kind.toUpperCase() } : null)}
        fileStatus={material.fileStatus}
        canDownload={canDownload}
        watermark={watermark}
      />
    </article>
  );
}
