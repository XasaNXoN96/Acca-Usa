"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/types";

type Status = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export interface MediaTextSnapshot {
  sttConnected: boolean;
  transcript: { language: Locale; status: Status; provider: string; errorCode?: string; text: string } | null;
  subtitles: { language: Locale; enabled: boolean }[];
}

const LOCALES: Locale[] = ["en", "ru", "uz"];
const NAMES: Record<Locale, string> = { en: "English", ru: "Русский", uz: "O‘zbekcha" };

/** Admin editor for a video / audio material: transcript (manual or speech-to-text) and WebVTT / SRT subtitle tracks. */
export function MediaTextPanel({ materialId, initial }: { materialId: string; initial: MediaTextSnapshot }) {
  const t = useTranslations("admin.mediaText");
  const [snap, setSnap] = useState(initial);
  const [lang, setLang] = useState<Locale>(initial.transcript?.language ?? "en");
  const [text, setText] = useState(initial.transcript?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "destructive"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [subLang, setSubLang] = useState<Locale>("en");
  const base = `/api/materials/${encodeURIComponent(materialId)}/media-text`;

  const err = useCallback((code?: string, line?: number) => {
    const known = ["STT_NOT_CONNECTED", "STT_REQUEST_FAILED", "STT_BAD_RESPONSE", "STT_TIMEOUT", "FFMPEG_NOT_AVAILABLE", "TRANSCODE_FAILED", "SOURCE_MISSING", "NOT_FOUND", "NOT_MEDIA", "FILE_NOT_READY", "ALREADY_RUNNING", "BAD_LINE", "NO_TRANSCRIPT", "TYPE", "SIZE", "EMPTY", "SIGNATURE", "NOT_SUBTITLES", "BAD_TIMES", "TOO_MANY_CUES"];
    return (t as unknown as (k: string, v?: Record<string, number>) => string)(`errors.${code && known.includes(code) ? code : "FAILED"}`, { line: line ?? 0 });
  }, [t]);

  async function send(init: RequestInit, successMessage?: string) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(base, init);
      const body = (await res.json().catch(() => null)) as (MediaTextSnapshot & { ok?: boolean; code?: string; line?: number }) | null;
      if (!res.ok || !body?.ok) { setMessage({ kind: "destructive", text: err(body?.code, body?.line) }); return false; }
      setSnap({ sttConnected: body.sttConnected, transcript: body.transcript, subtitles: body.subtitles });
      if (successMessage) setMessage({ kind: "success", text: successMessage });
      return body;
    } catch {
      setMessage({ kind: "destructive", text: err() });
      return false;
    } finally { setBusy(false); }
  }
  const act = (action: string, extra: Record<string, unknown> = {}, ok?: string) =>
    send({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) }, ok);

  // Follow a running speech-to-text job.
  const running = snap.transcript?.status === "QUEUED" || snap.transcript?.status === "PROCESSING";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const r = await fetch(base, { cache: "no-store" }).then((x) => x.json()).catch(() => null) as (MediaTextSnapshot & { ok?: boolean }) | null;
      if (r?.ok) { setSnap({ sttConnected: r.sttConnected, transcript: r.transcript, subtitles: r.subtitles }); if (r.transcript && r.transcript.status !== "QUEUED" && r.transcript.status !== "PROCESSING") setText(r.transcript.text); }
    }, 2500);
    return () => clearInterval(timer);
  }, [running, base]);

  async function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("language", subLang); form.set("file", file);
    await send({ method: "POST", body: form }, t("saved"));
    if (fileRef.current) fileRef.current.value = "";
  }

  const selectCls = "h-10 rounded-lg border border-input bg-background px-3 text-sm";
  return (
    <div className="space-y-8">
      <Alert variant={snap.sttConnected ? "success" : "warning"} data-stt={snap.sttConnected ? "connected" : "not-connected"}>
        {snap.sttConnected ? t("sttOn") : t("sttOff")}
      </Alert>
      {message ? <Alert variant={message.kind}>{message.text}</Alert> : null}

      <section aria-labelledby="mt-transcript" className="space-y-3">
        <h2 id="mt-transcript" className="type-h2">{t("transcriptTitle")}</h2>
        {snap.transcript ? (
          <p className="type-small flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{t("status")}:</span> <Badge variant={snap.transcript.status === "COMPLETED" ? "success" : snap.transcript.status === "FAILED" ? "destructive" : "warning"}>{t(`statuses.${snap.transcript.status}`)}</Badge>
            <span>{t("provider")}: {snap.transcript.provider === "manual" ? t("manual") : snap.transcript.provider}</span>
            {snap.transcript.errorCode ? <span className="text-destructive">{err(snap.transcript.errorCode)}</span> : null}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mt-lang" className="type-small font-medium">{t("language")}</label>
          <select id="mt-lang" value={lang} onChange={(e) => setLang(e.target.value as Locale)} className={selectCls}>
            {LOCALES.map((l) => <option key={l} value={l}>{NAMES[l]}</option>)}
          </select>
        </div>
        <label htmlFor="mt-text" className="sr-only">{t("transcriptTitle")}</label>
        <textarea id="mt-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} spellCheck={false} aria-describedby="mt-help" className="w-full rounded-lg border border-input bg-background p-3 font-mono text-sm" />
        <p id="mt-help" className="type-caption text-muted-foreground">{t("transcriptHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void act("saveTranscript", { language: lang, text }, t("saved"))}>{busy ? t("saving") : t("save")}</Button>
          <Button type="button" variant="outline" disabled={busy || running || !snap.sttConnected} onClick={() => void act("generate", { language: lang })}>{t("generate")}</Button>
          {snap.transcript ? <Button type="button" variant="ghost" disabled={busy} onClick={async () => { if (await act("deleteTranscript")) setText(""); }}>{t("remove")}</Button> : null}
        </div>
      </section>

      <section aria-labelledby="mt-subs" className="space-y-3">
        <h2 id="mt-subs" className="type-h2">{t("subtitlesTitle")}</h2>
        <p className="type-small text-muted-foreground">{t("subtitlesHelp")}</p>
        {snap.subtitles.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {snap.subtitles.map((s) => (
              <li key={s.language} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-24 font-medium">{NAMES[s.language]}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.enabled} disabled={busy} onChange={(e) => void act("toggleSubtitle", { language: s.language, enabled: e.target.checked })} />
                  {t("enabled")}
                </label>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act("removeSubtitle", { language: s.language })}>{t("delete")}</Button>
              </li>
            ))}
          </ul>
        ) : <p className="type-small text-muted-foreground">{t("none")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mt-sub-lang" className="type-small font-medium">{t("language")}</label>
          <select id="mt-sub-lang" value={subLang} onChange={(e) => setSubLang(e.target.value as Locale)} className={selectCls}>
            {LOCALES.map((l) => <option key={l} value={l}>{NAMES[l]}</option>)}
          </select>
          <input ref={fileRef} id="mt-sub-file" type="file" accept=".vtt,.srt" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>{t("upload")}</Button>
          <Button type="button" variant="outline" disabled={busy || snap.transcript?.status !== "COMPLETED"} onClick={() => void act("subtitleFromTranscript", { language: subLang }, t("saved"))}>{t("fromTranscript")}</Button>
        </div>
      </section>
    </div>
  );
}
