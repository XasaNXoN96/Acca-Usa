import { Download, ExternalLink, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Material } from "@/types";

/** Files are always served through /api/files/[id]: session-checked, nosniff, correct Content-Type. */
export const fileUrl = (id: string, download = false) => `/api/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;

export function MaterialCard({ material }: { material: Material }) {
  const t = useTranslations("topic");
  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-semibold">{material.title}</h3>
        <span className="type-caption text-muted-foreground">{material.meta}</span>
      </header>
      <Viewer material={material} unsupportedVideo={t("videoUnsupported")} unsupportedAudio={t("audioUnsupported")} />
      {material.fileId ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={fileUrl(material.fileId)} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />{t("open")}</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={fileUrl(material.fileId, true)}><Download aria-hidden />{t("download")}</a>
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function Viewer({ material, unsupportedVideo, unsupportedAudio }: { material: Material; unsupportedVideo: string; unsupportedAudio: string }) {
  const { kind, fileId, body, title } = material;
  if (kind === "notes") {
    // Plain text only — never interpreted as HTML (no XSS surface).
    return <p className="whitespace-pre-wrap text-pretty leading-relaxed">{body}</p>;
  }
  if (!fileId) return null;
  const src = fileUrl(fileId);
  if (kind === "video") {
    return (
      <video controls preload="metadata" playsInline className="aspect-video w-full rounded-lg bg-black" aria-label={title}>
        <source src={src} type={material.fileMime} />
        {unsupportedVideo}
      </video>
    );
  }
  if (kind === "audio") {
    return (
      <audio controls preload="metadata" className="w-full" aria-label={title}>
        <source src={src} type={material.fileMime} />
        {unsupportedAudio}
      </audio>
    );
  }
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- dynamic, access-controlled API URL; next/image optimisation does not apply
    return <img src={src} alt={title} loading="lazy" className="max-h-[32rem] w-full rounded-lg object-contain" />;
  }
  if ((kind === "pdf" || kind === "slides" || kind === "book") && material.fileMime === "application/pdf") {
    return <iframe src={src} title={title} className="h-[70dvh] min-h-96 w-full rounded-lg border border-border bg-muted" />;
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
      <FileText className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{title}</span>
    </div>
  );
}
