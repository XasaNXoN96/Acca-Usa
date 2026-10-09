"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadRules, type UploadKind } from "@/services/storage/validation";
import { formatBytes, uploadFile } from "@/features/storage/upload-client";
import { saveResourceAction } from "./actions";

interface Opt { value: string; label: string }
type Row = { key: string; file: File; title: string; kind: UploadKind | null; state: "queued" | "uploading" | "saving" | "done" | "error"; percent: number; error?: string };

/** extension → (upload kind = material kind). Unknown extensions are rejected before any upload. */
export function kindForFile(name: string): UploadKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  for (const k of ["video", "audio", "image", "pdf", "slides", "file"] as const) if (uploadRules[k].exts.includes(ext) && !(k === "slides" && ext === "pdf") && !(k === "file" && ["pdf", "pptx"].includes(ext))) return k;
  return null;
}
const titleOf = (name: string) => {
  const t = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (t.length >= 3 ? t : `${t} file`.trim().padEnd(3, "_")).slice(0, 160);
};

/** Admin bulk upload: pick a subject / topic once, drop many files; each is validated, uploaded with progress and saved as a material. */
export function BulkUpload({ subjects, topics }: { subjects: Opt[]; topics: (Opt & { subject: string })[] }) {
  const t = useTranslations("admin.bulk");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [visibility, setVisibility] = useState<"draft" | "published">("draft");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function add(files: FileList | File[]) {
    const next: Row[] = [...files].map((file, i) => {
      const kind = kindForFile(file.name);
      const rule = kind ? uploadRules[kind] : null;
      const error = !kind ? t("badType") : file.size === 0 ? t("empty") : rule && file.size > rule.maxBytes ? t("tooLarge", { max: formatBytes(rule.maxBytes) }) : undefined;
      return { key: `${Date.now()}-${i}-${file.name}`, file, title: titleOf(file.name), kind, state: error ? "error" : "queued", percent: 0, error };
    });
    setRows((all) => [...all, ...next]);
  }

  async function runOne(r: Row) {
    if (!r.kind) return;
    patch(r.key, { state: "uploading", percent: 0, error: undefined });
    const up = await uploadFile(r.kind, r.file, (percent) => patch(r.key, { percent })).promise;
    if (!up.ok) return patch(r.key, { state: "error", error: up.code === "SIZE" ? t("tooLarge", { max: formatBytes(up.max ?? 0) }) : up.code === "TYPE" ? t("badType") : t("failed") });
    patch(r.key, { state: "saving", percent: 100 });
    const res = await saveResourceAction("materials", null, {
      title: r.title, kind: r.kind, subject, topic, fileId: up.file.id, body: "", visibility, publishAt: "", position: 0,
    });
    patch(r.key, res.ok ? { state: "done" } : { state: "error", error: t("saveFailed") });
  }

  async function start() {
    setRunning(true);
    const todo = rows.filter((r) => r.state === "queued" || (r.state === "error" && r.kind && r.file.size > 0));
    const pool = [...todo];
    await Promise.all(Array.from({ length: 2 }, async () => { for (let r = pool.shift(); r; r = pool.shift()) await runOne(r); })); // 2 uploads at a time
    setRunning(false);
  }

  const topicOptions = topics.filter((x) => x.subject === subject);
  const pending = rows.some((r) => r.state === "queued" || (r.state === "error" && r.kind && r.file.size > 0));
  const selectCls = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="bu-subject" className="type-small font-medium">{t("subject")}</label>
          <select id="bu-subject" className={selectCls} value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(""); }}>
            <option value="">{t("choose")}</option>
            {subjects.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bu-topic" className="type-small font-medium">{t("topic")}</label>
          <select id="bu-topic" className={selectCls} value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!subject}>
            <option value="">—</option>
            {topicOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bu-vis" className="type-small font-medium">{t("visibility")}</label>
          <select id="bu-vis" className={selectCls} value={visibility} onChange={(e) => setVisibility(e.target.value as "draft" | "published")}>
            <option value="draft">{t("draft")}</option>
            <option value="published">{t("published")}</option>
          </select>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        className="grid place-items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center"
      >
        <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm">{t("drop")}</p>
        <input ref={input} id="bu-files" type="file" multiple className="sr-only" aria-label={t("choose")} onChange={(e) => { if (e.target.files) add(e.target.files); if (input.current) input.current.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>{t("pick")}</Button>
        <p className="type-caption text-muted-foreground">{t("hint")}</p>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label={t("files")}>
          {rows.map((r) => (
            <li key={r.key} className="space-y-2 p-3" data-state={r.state}>
              <div className="flex flex-wrap items-center gap-3">
                {r.state === "done" ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : r.state === "error" ? <CircleAlert className="size-5 text-destructive" aria-hidden /> : r.state === "queued" ? <span className="size-5" /> : <Loader2 className="size-5 animate-spin" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <input aria-label={t("titleOf", { name: r.file.name })} value={r.title} disabled={r.state !== "queued" && r.state !== "error"} maxLength={160}
                    onChange={(e) => patch(r.key, { title: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium" />
                  <p className="type-caption text-muted-foreground">{r.file.name} · {formatBytes(r.file.size)}{r.kind ? ` · ${r.kind}` : ""}</p>
                </div>
                <span className="type-caption" role="status">{t(`states.${r.state}`)}</span>
              </div>
              {r.state === "uploading" ? <Progress value={r.percent} tone="navy" label={`${r.file.name} ${r.percent}%`} className="h-1.5" /> : null}
              {r.error ? <p className="text-sm text-destructive" role="alert">{r.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!subject && rows.length ? <Alert variant="warning">{t("needSubject")}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={running || !subject || !pending} onClick={() => void start()}>{running ? t("working") : t("start")}</Button>
        {rows.length ? <Button type="button" variant="ghost" disabled={running} onClick={() => setRows((all) => all.filter((r) => r.state !== "done"))}>{t("clearDone")}</Button> : null}
      </div>
    </div>
  );
}
