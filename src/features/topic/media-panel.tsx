import { Download, Headphones, Lock, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Material, MaterialKind } from "@/types";

/**
 * Placeholder for the media area. Real streaming / file storage arrives with the backend block;
 * the structure (player frame, resource list) is final so wiring it in changes no layout.
 */
export function MediaPanel({ kind, title, materials }: { kind: Exclude<MaterialKind, "book">; title: string; materials: Material[] }) {
  const t = useTranslations("topic");
  const k = useTranslations("subject.materialKinds");
  const list = materials.filter((m) => m.kind === kind);
  const isVideo = kind === "video";

  return (
    <div className="space-y-4">
      <div
        className={
          isVideo
            ? "relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-navy to-[#16396b] text-white"
            : "grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-muted/40"
        }
      >
        {isVideo ? (
          <>
            <p className="absolute left-4 top-4 max-w-[80%] truncate text-sm font-semibold text-white/80">{title}</p>
            <Button size="icon" variant="secondary" disabled className="size-16 rounded-full" aria-label={k("video")}>
              <Play className="size-7 fill-current" aria-hidden />
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            {kind === "audio" ? <Headphones className="size-8" aria-hidden /> : <Lock className="size-8" aria-hidden />}
            <p className="text-sm font-semibold">{k(kind)}</p>
          </div>
        )}
      </div>

      <Alert variant="info" title={t("mediaPending")}>
        {t("mediaPendingText", { kind: k(kind) })}
      </Alert>

      {list.length > 0 && !isVideo ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((m) => (
            <li key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.title}</span>
                <span className="type-caption text-muted-foreground">{m.meta}</span>
              </span>
              {kind === "pdf" || kind === "slides" ? (
                <Button size="sm" variant="outline" disabled>
                  <Download aria-hidden />
                  {k(kind)}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
