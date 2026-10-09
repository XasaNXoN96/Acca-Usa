"use client";

import { Fragment, useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Maximize2, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fileUrl } from "@/lib/file-url";
import { PdfReader } from "./pdf-reader";
import { WatermarkOverlay } from "./watermark-overlay";
import type { MaterialKind } from "@/types";

export interface ViewerFile {
  name: string;
  mime: string;
  sizeLabel: string;
  typeLabel: string;
}

export interface ViewerMaterial {
  id: string;
  title: string;
  kind: MaterialKind;
  fileId?: string;
  body?: string;
}

/**
 * One viewer per material type. Files are only ever addressed through /api/files/[id] (session + enrolment + unlocked
 * topic checked on the server) — there is no public URL for a locked material. Text is rendered as plain text blocks,
 * never as HTML.
 */
export function MaterialViewer({ material, file, canDownload = false, watermark = null, fileStatus }: {
  material: ViewerMaterial; file: ViewerFile | null;
  /** ADMIN only (server-decided). Students never get a download / open-original control. */
  canDownload?: boolean;
  /** Personal watermark text (abbreviated name · tag · date); null = none (admin preview may still pass one). */
  watermark?: string | null;
  /** Media-pipeline state; undefined = READY (legacy). Not READY → a status message instead of a player. */
  fileStatus?: string;
}) {
  const t = useTranslations("material");
  const { kind, fileId, body, title } = material;

  if (kind === "notes") return <TextViewer body={body ?? ""} />;
  if (!fileId || !file) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">{t("noFile")}</p>;

  if (fileStatus && fileStatus !== "READY") {
    return <p role="status" className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">{fileStatus === "UPLOADED" || fileStatus === "PROCESSING" ? t("processing") : t("unavailable")}</p>;
  }
  if (kind === "video") return <VideoViewer id={fileId} title={title} watermark={watermark} />;
  if (kind === "audio") return <AudioViewer id={fileId} title={title} />;
  if (kind === "image") return <ImageViewer id={fileId} title={title} watermark={watermark} />;
  if (file.mime === "application/pdf") {
    return (
      <div className="space-y-3">
        <PdfReader id={fileId} title={title} watermark={watermark} />
        {canDownload ? <OpenButtons id={fileId} /> : null}
      </div>
    );
  }
  return <GeneralFile id={fileId} file={file} canDownload={canDownload} />;
}

function OpenButtons({ id }: { id: string }) {
  const t = useTranslations("material");
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <a href={fileUrl(id)} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />{t("open")}</a>
      </Button>
      <Button asChild variant="outline">
        <a href={fileUrl(id, true)}><Download aria-hidden />{t("download")}</a>
      </Button>
    </div>
  );
}

function VideoViewer({ id, title, watermark }: { id: string; title: string; watermark: string | null }) {
  const t = useTranslations("material");
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-3" data-protected>
      {/* native controls: play / pause, seek bar (progress), time, volume, fullscreen — `nodownload` removes the download item */}
      <div className="relative">
        <video
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          preload="metadata"
          playsInline
          aria-label={title}
          onError={() => setFailed(true)}
          onContextMenu={(e) => e.preventDefault()}
          className="aspect-video max-h-[75dvh] w-full rounded-xl bg-black"
        >
          <source src={fileUrl(id)} onError={() => setFailed(true)} />
          {t("videoUnsupported")}
        </video>
        {watermark ? <WatermarkOverlay text={watermark} /> : null}
      </div>
      {failed ? <p role="alert" className="text-sm text-destructive">{t("loadError")}</p> : null}
    </div>
  );
}

function AudioViewer({ id, title }: { id: string; title: string }) {
  const t = useTranslations("material");
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-soft text-navy"><Music className="size-6" aria-hidden /></span>
        <p className="min-w-0 flex-1 text-pretty font-semibold [overflow-wrap:anywhere]">{title}</p>
      </div>
      <audio controls controlsList="nodownload" preload="metadata" aria-label={title} onError={() => setFailed(true)} onContextMenu={(e) => e.preventDefault()} className="w-full">
        <source src={fileUrl(id)} onError={() => setFailed(true)} />
        {t("audioUnsupported")}
      </audio>
      {failed ? <p role="alert" className="text-sm text-destructive">{t("loadError")}</p> : null}
    </div>
  );
}

function ImageViewer({ id, title, watermark }: { id: string; title: string; watermark: string | null }) {
  const t = useTranslations("material");
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="alert" className="text-sm text-destructive">{t("loadError")}</p>;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" data-protected aria-label={`${t("enlarge")}: ${title}`} className="group relative block w-full overflow-hidden rounded-xl border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- access-controlled API URL; next/image optimisation does not apply */}
          <img src={fileUrl(id)} alt={title} draggable={false} onContextMenu={(e) => e.preventDefault()} onError={() => setFailed(true)} className="mx-auto max-h-[70dvh] w-full select-none object-contain" />
          {watermark ? <WatermarkOverlay text={watermark} /> : null}
          <span className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg bg-black/60 text-white" aria-hidden><Maximize2 className="size-4" /></span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(96vw,64rem)]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{t("enlarge")}</DialogDescription>
        <div className="relative" data-protected>
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img src={fileUrl(id)} alt={title} draggable={false} onContextMenu={(e) => e.preventDefault()} className="mx-auto max-h-[80dvh] w-full select-none object-contain" />
          {watermark ? <WatermarkOverlay text={watermark} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GeneralFile({ id, file, canDownload }: { id: string; file: ViewerFile; canDownload: boolean }) {
  const t = useTranslations("material");
  const rows: [string, string][] = [[t("fileName"), file.name], [t("fileType"), file.typeLabel], [t("fileSize"), file.sizeLabel]];
  const textual = file.mime.startsWith("text/plain") || file.mime.startsWith("text/csv");
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6" data-protected>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-soft text-navy"><FileText className="size-6" aria-hidden /></span>
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="type-caption text-muted-foreground">{k}</dt>
              <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{v}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      {textual ? <TextFile id={id} /> : <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground" data-view-only>{canDownload ? t("adminOnlyFile") : t("notPreviewable")}</p>}
      {canDownload ? <OpenButtons id={id} /> : null}
    </div>
  );
}

/** Plain text / CSV files are shown as text (never as HTML). */
function TextFile({ id }: { id: string }) {
  const t = useTranslations("material");
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(fileUrl(id), { credentials: "same-origin" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error("load")))).then((x) => live && setText(x.slice(0, 200_000))).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [id]);
  if (failed) return <p role="alert" className="text-sm text-destructive">{t("loadError")}</p>;
  return <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm [overflow-wrap:anywhere]" tabIndex={0}>{text ?? "…"}</pre>;
}

/** Plain-text → blocks: "# " headings, "• " / "- " lists, blank-line separated paragraphs. Never HTML. */
function TextViewer({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <article className="max-w-[68ch] space-y-4 text-pretty text-base leading-7 sm:text-[1.0625rem] sm:leading-8">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[•-]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-6 marker:text-muted-foreground">
              {lines.map((l, j) => <li key={j}>{l.replace(/^\s*[•-]\s+/, "")}</li>)}
            </ul>
          );
        }
        if (lines.length === 1 && block.startsWith("# ")) return <h2 key={i} className="type-h2 pt-2">{block.slice(2)}</h2>;
        return <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">{block}</p>;
      })}
    </article>
  );
}
