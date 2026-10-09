"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Clock, FileText, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { NoteView } from "@/services/contracts";
import type { MaterialKind } from "@/types";
import { createNoteAction, deleteNoteAction, updateNoteAction } from "./notes-actions";

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mediaEl = () => document.querySelector<HTMLMediaElement>("main video, main audio");
const pdfPage = () => Number(document.querySelector("[data-pdf-reader] [data-page]")?.getAttribute("data-page") ?? document.querySelector("[data-page]")?.getAttribute("data-page") ?? 0) || null;

/** Private notes of the signed-in student for one material, saved on the server (never in the browser's storage). */
export function NotesPanel({ materialId, kind, initial, notesHref }: { materialId: string; kind: MaterialKind; initial: NoteView[]; notesHref: string }) {
  const t = useTranslations("material.notes");
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [anchor, setAnchor] = useState<{ pdfPage?: number; videoSeconds?: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timed = kind === "video" || kind === "audio";
  const paged = kind === "pdf" || kind === "slides" || kind === "book";
  const fail = (code: string) => setError(code === "LIMIT" ? t("limit") : code === "FORBIDDEN" ? t("forbidden") : t("failed"));

  const attach = () => {
    if (timed) { const m = mediaEl(); if (m) setAnchor({ videoSeconds: Math.floor(m.currentTime) }); }
    else if (paged) { const p = pdfPage(); if (p) setAnchor({ pdfPage: p }); }
  };
  const jump = (n: NoteView) => {
    if (n.videoSeconds !== undefined) { const m = mediaEl(); if (m) { m.currentTime = n.videoSeconds; void m.play().catch(() => undefined); } }
    else if (n.pdfPage !== undefined) window.dispatchEvent(new CustomEvent("acca:pdf-goto", { detail: n.pdfPage }));
  };

  const add = () => start(async () => {
    setError(null);
    const r = await createNoteAction({ materialId, body: text, ...anchor });
    if (r.ok && r.note) { setNotes((all) => [...all, r.note!]); setText(""); setAnchor(null); } else if (!r.ok) fail(r.code);
  });
  const save = () => editing && start(async () => {
    setError(null);
    const r = await updateNoteAction({ noteId: editing.id, body: editing.text });
    if (r.ok && r.note) { setNotes((all) => all.map((n) => (n.id === r.note!.id ? r.note! : n))); setEditing(null); } else if (!r.ok) fail(r.code);
  });
  const remove = (n: NoteView) => {
    if (!window.confirm(t("confirmDelete"))) return;
    start(async () => { const r = await deleteNoteAction({ noteId: n.id }); if (r.ok) setNotes((all) => all.filter((x) => x.id !== n.id)); else fail(r.code); });
  };

  return (
    <section aria-labelledby="notes-title" className="space-y-3 rounded-xl border border-border bg-card p-4" data-notes-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notes-title" className="type-h3">{t("title")}</h2>
        <Button asChild variant="ghost" size="sm"><Link href={notesHref}>{t("all")}</Link></Button>
      </div>
      <p className="type-caption text-muted-foreground">{t("private")}</p>

      {notes.length === 0 ? <p className="type-small text-muted-foreground" data-notes-empty>{t("empty")}</p> : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="space-y-1 rounded-lg border border-border p-3" data-note>
              {n.videoSeconds !== undefined || n.pdfPage !== undefined ? (
                <button type="button" onClick={() => jump(n)} className="type-caption inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-semibold text-primary hover:underline">
                  {n.videoSeconds !== undefined ? <><Clock className="size-3.5" aria-hidden />{stamp(n.videoSeconds)}</> : <><FileText className="size-3.5" aria-hidden />{t("page", { page: n.pdfPage ?? 0 })}</>}
                </button>
              ) : null}
              {editing?.id === n.id ? (
                <div className="space-y-2">
                  <label htmlFor={`edit-${n.id}`} className="sr-only">{t("edit")}</label>
                  <textarea id={`edit-${n.id}`} value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} rows={3} maxLength={2000} className="w-full rounded-lg border border-input bg-background p-2 text-sm" />
                  <div className="flex gap-2"><Button type="button" size="sm" disabled={pending || !editing.text.trim()} onClick={save}>{t("save")}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button></div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{n.body}</p>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ id: n.id, text: n.body })}><Pencil aria-hidden />{t("edit")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(n)}><Trash2 className="text-destructive" aria-hidden />{t("delete")}</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <label htmlFor="note-new" className="type-small font-medium">{t("new")}</label>
        <textarea id="note-new" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-lg border border-input bg-background p-2 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          {timed || paged ? (
            <Button type="button" size="sm" variant="outline" onClick={attach}>{timed ? t("attachTime") : t("attachPage")}</Button>
          ) : null}
          {anchor ? (
            <span className="type-caption inline-flex items-center gap-2" data-note-anchor>
              {anchor.videoSeconds !== undefined ? stamp(anchor.videoSeconds) : t("page", { page: anchor.pdfPage ?? 0 })}
              <button type="button" className="min-h-8 rounded-md px-1 underline" onClick={() => setAnchor(null)}>{t("detach")}</button>
            </span>
          ) : null}
          <Button type="button" size="sm" disabled={pending || !text.trim()} onClick={add}>{t("add")}</Button>
        </div>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </section>
  );
}
