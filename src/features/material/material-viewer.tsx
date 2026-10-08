"use client";

import { Fragment, useState } from "react";
import { Download, ExternalLink, FileText, Maximize2, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fileUrl } from "@/features/topic/material-viewers";
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
export function MaterialViewer({ material, file }: { material: ViewerMaterial; file: ViewerFile | null }) {
  const t = useTranslations("material");
  const { kind, fileId, body, title } = material;

  if (kind === "notes") return <TextViewer body={body ?? ""} />;
  if (!fileId || !file) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">{t("noFile")}</p>;

  if (kind === "video") return <VideoViewer id={fileId} title={title} mime={file.mime} />;
  if (kind === "audio") return <AudioViewer id={fileId} title={title} mime={file.mime} />;
  if (kind === "image") return <ImageViewer id={fileId} title={title} />;
  if (file.mime === "application/pdf") return <PdfViewer id={fileId} title={title} />;
  return <GeneralFile id={fileId} file={file} />;
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

function VideoViewer({ id, title, mime }: { id: string; title: string; mime: string }) {
  const t = useTranslations("material");
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-3">
      {/* native controls: play / pause, seek bar (progress), current time and duration, fullscreen */}
      <video
        controls
        preload="metadata"
        playsInline
        aria-label={title}
        onError={() => setFailed(true)}
        className="aspect-video max-h-[75dvh] w-full rounded-xl bg-black"
      >
        <source src={fileUrl(id)} type={mime} onError={() => setFailed(true)} />
        {t("videoUnsupported")}
      </video>
      {failed ? <p role="alert" className="text-sm text-destructive">{t("loadError")}</p> : null}
    </div>
  );
}

function AudioViewer({ id, title, mime }: { id: string; title: string; mime: string }) {
  const t = useTranslations("material");
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-soft text-navy"><Music className="size-6" aria-hidden /></span>
        <p className="min-w-0 flex-1 text-pretty font-semibold [overflow-wrap:anywhere]">{title}</p>
      </div>
      <audio controls preload="metadata" aria-label={title} onError={() => setFailed(true)} className="w-full">
        <source src={fileUrl(id)} type={mime} onError={() => setFailed(true)} />
        {t("audioUnsupported")}
      </audio>
      {failed ? <p role="alert" className="text-sm text-destructive">{t("loadError")}</p> : null}
    </div>
  );
}

function PdfViewer({ id, title }: { id: string; title: string }) {
  const t = useTranslations("material");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-3">
      <div className="relative">
        {!loaded && !failed ? <Skeleton className="absolute inset-0 h-full w-full rounded-xl" /> : null}
        <iframe
          src={fileUrl(id)}
          title={title}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="h-[70dvh] min-h-[24rem] w-full rounded-xl border border-border bg-muted"
        />
      </div>
      {failed ? <p role="alert" className="text-sm text-destructive">{t("loadError")}</p> : <p className="type-small text-muted-foreground">{t("pdfHint")}</p>}
      <OpenButtons id={id} />
    </div>
  );
}

function ImageViewer({ id, title }: { id: string; title: string }) {
  const t = useTranslations("material");
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="alert" className="text-sm text-destructive">{t("loadError")}</p>;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={`${t("enlarge")}: ${title}`} className="group relative block w-full overflow-hidden rounded-xl border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- access-controlled API URL; next/image optimisation does not apply */}
          <img src={fileUrl(id)} alt={title} onError={() => setFailed(true)} className="mx-auto max-h-[70dvh] w-full object-contain" />
          <span className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg bg-black/60 text-white" aria-hidden><Maximize2 className="size-4" /></span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(96vw,64rem)]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{t("enlarge")}</DialogDescription>
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img src={fileUrl(id)} alt={title} className="mx-auto max-h-[80dvh] w-full object-contain" />
      </DialogContent>
    </Dialog>
  );
}

function GeneralFile({ id, file }: { id: string; file: ViewerFile }) {
  const t = useTranslations("material");
  const rows: [string, string][] = [[t("fileName"), file.name], [t("fileType"), file.typeLabel], [t("fileSize"), file.sizeLabel]];
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
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
      <OpenButtons id={id} />
    </div>
  );
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
