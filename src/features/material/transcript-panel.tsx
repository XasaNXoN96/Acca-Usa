"use client";

import { useTranslations } from "next-intl";

export interface TranscriptLine { start: number; text: string }

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Read-only transcript for students: timestamps seek the player on the page. Shown only when a transcript exists. */
export function TranscriptPanel({ lines }: { lines: TranscriptLine[] }) {
  const t = useTranslations("material.transcript");
  if (!lines.length) return null;
  const seek = (s: number) => {
    const media = document.querySelector<HTMLMediaElement>("main video, main audio");
    if (media) { media.currentTime = s; void media.play().catch(() => undefined); }
  };
  return (
    <details className="rounded-xl border border-border bg-card p-4" data-transcript>
      <summary className="cursor-pointer select-none font-semibold">{t("title")}</summary>
      <ol className="mt-3 max-h-[50dvh] space-y-2 overflow-auto pr-1 text-sm">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-3">
            <button type="button" onClick={() => seek(l.start)} aria-label={t("seek", { time: stamp(l.start) })} className="shrink-0 font-mono text-primary hover:underline">{stamp(l.start)}</button>
            <span className="min-w-0 [overflow-wrap:anywhere]">{l.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
