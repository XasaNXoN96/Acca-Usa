"use client";

import { useEffect, useRef, useState } from "react";
import { File as FileIcon, Loader2, Paperclip, RefreshCw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadKindFor, uploadRules } from "@/services/storage/validation";
import { deleteUpload, fetchMediaStatus, formatBytes, retryMedia, uploadFile, type MediaStatus, type UploadedFile } from "./upload-client";

type State = { phase: "idle" } | { phase: "uploading"; percent: number; name: string } | { phase: "error"; message: string };

/**
 * Upload control for materials. Pre-checks type/size for instant feedback; the server repeats every check
 * (extension allow-list, size cap, magic bytes). Shows progress, success, error, preview, replace, remove.
 */
export function FileField({
  id,
  materialKind,
  value,
  initialFile,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  materialKind: string;
  value: string;
  initialFile?: UploadedFile;
  onChange: (fileId: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [file, setFile] = useState<UploadedFile | undefined>(initialFile);
  const [freshIds, setFreshIds] = useState<string[]>([]); // uploaded in this dialog and not yet saved

  const [mediaState, setMediaState] = useState<{ id: string; s: MediaStatus } | null>(null);
  const media = mediaState && mediaState.id === value ? mediaState.s : null;
  const setMedia = (s: MediaStatus) => setMediaState({ id: value, s });
  const processable = materialKind === "video" || materialKind === "audio";
  const status = media?.status ?? file?.status ?? "READY";

  // Video / audio are processed by the media pipeline (ffprobe + FFmpeg): poll until READY / FAILED / REJECTED.
  useEffect(() => {
    if (!processable || !value || (status !== "UPLOADED" && status !== "PROCESSING")) return;
    let live = true;
    const tick = async () => { const s = await fetchMediaStatus(value); if (live && s) setMediaState({ id: value, s }); };
    void tick();
    const timer = setInterval(() => void tick(), 2000);
    return () => { live = false; clearInterval(timer); };
  }, [processable, value, status]);

  const kind = uploadKindFor(materialKind);
  const rule = kind ? uploadRules[kind] : null;
  const current = value ? (file && file.id === value ? file : undefined) : undefined;

  const describe = (code: string, max?: number, types?: string[]): string => {
    const maxLabel = formatBytes(max ?? rule?.maxBytes ?? 0);
    const typeLabel = (types ?? rule?.exts ?? []).join(", ");
    switch (code) {
      case "SIZE": return t("tooLarge", { max: maxLabel });
      case "TYPE": return t("badType", { types: typeLabel });
      case "SIGNATURE": return t("badSignature");
      case "EMPTY": return t("empty");
      case "NETWORK": return t("network");
      case "FORBIDDEN": return t("forbidden");
      default: return t("failed");
    }
  };

  async function pick(f: File | undefined) {
    if (!f || !kind || !rule) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (f.size === 0) return setState({ phase: "error", message: describe("EMPTY") });
    if (!rule.exts.includes(ext)) return setState({ phase: "error", message: describe("TYPE") });
    if (f.size > rule.maxBytes) return setState({ phase: "error", message: describe("SIZE") });

    setState({ phase: "uploading", percent: 0, name: f.name });
    const { promise, abort } = uploadFile(kind, f, (percent) => setState({ phase: "uploading", percent, name: f.name }));
    abortRef.current = abort;
    const res = await promise;
    abortRef.current = null;
    if (!res.ok) return setState(res.code === "ABORTED" ? { phase: "idle" } : { phase: "error", message: describe(res.code, res.max, res.types) });

    if (value && freshIds.includes(value)) void deleteUpload(value); // replaced an unsaved upload
    setFreshIds((ids) => [...ids.filter((x) => x !== value), res.file.id]);
    setFile(res.file);
    onChange(res.file.id);
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove() {
    if (value && freshIds.includes(value)) void deleteUpload(value);
    setFreshIds((ids) => ids.filter((x) => x !== value));
    setFile(undefined);
    onChange("");
    setState({ phase: "idle" });
  }

  if (!kind || !rule) return <p className="type-small text-muted-foreground">{t("selectKindFirst")}</p>;

  const accept = rule.exts.map((e) => `.${e}`).join(",");
  const previewUrl = value ? `/api/files/${encodeURIComponent(value)}` : null;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef} id={id} type="file" accept={accept} className="sr-only"
        aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      {state.phase === "uploading" ? (
        <div className="space-y-2 rounded-xl border border-border p-3" aria-live="polite">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{state.name}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => abortRef.current?.()}><X aria-hidden />{t("cancel")}</Button>
          </div>
          <Progress value={state.percent} tone="navy" label={t("uploading", { percent: state.percent })} className="h-2" />
          <p className="type-caption text-muted-foreground">{t("uploading", { percent: state.percent })}</p>
        </div>
      ) : current ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success-soft text-success"><FileIcon className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{current.name}</span>
              <span className="type-caption text-muted-foreground">{formatBytes(current.size)} · {t("uploaded")}</span>
            </span>
          </div>
          {processable && status !== "READY" ? (
            <div role="status" className="space-y-1 text-sm">
              <p className="font-medium">{status === "FAILED" ? t("proc.failed") : status === "REJECTED" ? t("proc.rejected") : status === "PROCESSING" ? t("proc.processing") : t("proc.queued")}</p>
              {media?.code ? <p className="text-destructive">{t(`codes.${media.code}` as never)}</p> : null}
              <p className="type-caption text-muted-foreground">{t("proc.notReadyHint")}</p>
              {status === "FAILED" ? <Button type="button" size="sm" variant="outline" onClick={async () => { const s = await retryMedia(value); if (s) setMedia(s); }}>{t("proc.retry")}</Button> : null}
            </div>
          ) : processable && media?.transcoded ? <p className="type-caption text-muted-foreground">{t("proc.converted")}</p> : null}
          {previewUrl && (!processable || status === "READY") ? <Preview url={previewUrl} mime={current.mime} name={current.name} label={t("preview")} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}><RefreshCw aria-hidden />{t("replace")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={remove}><Trash2 className="text-destructive" aria-hidden />{t("remove")}</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full justify-center border-dashed py-6" onClick={() => inputRef.current?.click()}>
          <Paperclip aria-hidden />
          {t("choose")}
        </Button>
      )}

      {state.phase === "error" ? <Alert variant="destructive">{state.message}</Alert> : null}
      <p className="type-caption text-muted-foreground">{t("allowed", { types: rule.exts.join(", "), max: formatBytes(rule.maxBytes) })}</p>
    </div>
  );
}

function Preview({ url, mime, name, label }: { url: string; mime: string; name: string; label: string }) {
  if (mime.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- access-controlled API URL
    return <img src={url} alt={`${label}: ${name}`} className="max-h-48 w-full rounded-lg object-contain" />;
  }
  if (mime.startsWith("video/")) return <video src={url} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" aria-label={`${label}: ${name}`} />;
  if (mime.startsWith("audio/")) return <audio src={url} controls preload="metadata" className="w-full" aria-label={`${label}: ${name}`} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="type-small inline-block font-semibold text-primary hover:underline">
      {label}: {name}
    </a>
  );
}
