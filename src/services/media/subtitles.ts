import type { TranscriptSegment } from "../contracts";

/**
 * Subtitle / transcript text handling (pure functions, no I/O).
 *  • SRT and WebVTT uploads are parsed into cues and re-serialised as clean WebVTT (no styling, no markup, no scripts)
 *  • transcripts are edited as plain lines:  [HH:]MM:SS  text
 */
export const MAX_SUBTITLE_BYTES = 1024 * 1024;
export const MAX_CUES = 5000;

const TS = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

export function parseTimestamp(raw: string): number | null {
  const m = TS.exec(raw.trim());
  if (!m) return null;
  const [, h, min, s, ms] = m;
  if (Number(s) > 59 || (h !== undefined && Number(min) > 59)) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + Number((ms ?? "0").padEnd(3, "0")) / 1000;
}

export function formatTimestamp(sec: number, sep: "." | "," = "."): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** Removes markup and control characters from a cue text. */
const clean = (s: string) => s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/-->/g, "→").trim();

export type ParsedSubtitles = { ok: true; cues: TranscriptSegment[] } | { ok: false; code: "EMPTY" | "NOT_SUBTITLES" | "TOO_MANY_CUES" | "BAD_TIMES" };

export function parseSubtitles(text: string): ParsedSubtitles {
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!body) return { ok: false, code: "EMPTY" };
  const blocks = body.replace(/^WEBVTT[^\n]*\n+/, "").split(/\n{2,}/);
  const cues: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue; // NOTE / STYLE / REGION blocks and cue numbers without times are skipped
    const [a, b] = lines[at]!.split("-->").map((x) => x.trim().split(/\s+/)[0]!);
    const start = parseTimestamp(a ?? "");
    const end = parseTimestamp(b ?? "");
    if (start === null || end === null || end <= start) return { ok: false, code: "BAD_TIMES" };
    const cueText = clean(lines.slice(at + 1).join("\n"));
    if (cueText) cues.push({ start, end, text: cueText });
    if (cues.length > MAX_CUES) return { ok: false, code: "TOO_MANY_CUES" };
  }
  return cues.length ? { ok: true, cues } : { ok: false, code: "NOT_SUBTITLES" };
}

export function cuesToVtt(cues: TranscriptSegment[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${clean(c.text)}`).join("\n\n")}\n`;
}

/** "[HH:]MM:SS  text" per line → segments. A segment ends where the next one starts (the last one lasts `lastLength` s). */
export function parseTranscriptText(text: string, durationSeconds?: number | null): { ok: true; segments: TranscriptSegment[] } | { ok: false; line: number } {
  const rows: { start: number; text: string }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const m = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s+(.+)$/.exec(line);
    const start = m ? parseTimestamp(m[1]!) : null;
    if (!m || start === null) return { ok: false, line: i + 1 };
    rows.push({ start, text: clean(m[2]!) });
  }
  rows.sort((a, b) => a.start - b.start);
  const segments = rows.filter((r) => r.text).map((r, i, all) => ({
    start: r.start,
    end: all[i + 1] ? Math.max(all[i + 1]!.start, r.start + 0.5) : Math.max(r.start + 3, Math.min(durationSeconds ?? r.start + 3, r.start + 10)),
    text: r.text,
  }));
  return { ok: true, segments };
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `${formatTimestamp(s.start).slice(0, 8)} ${s.text}`).join("\n");
}
