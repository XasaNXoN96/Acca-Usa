import { after } from "next/server";
import { json, sameOrigin } from "@/lib/api-guards";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { services } from "@/services";
import { cuesToVtt, MAX_SUBTITLE_BYTES, parseSubtitles, parseTranscriptText, transcriptToText } from "@/services/media/subtitles";
import { speechConnected } from "@/services/speech";
import { requestTranscript, runTranscription } from "@/services/speech/run";
import { getStorage } from "@/services/storage";
import { locales } from "@/i18n/config";
import type { Locale } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isLocale = (v: unknown): v is Locale => typeof v === "string" && (locales as readonly string[]).includes(v);

async function mediaMaterial(id: string) {
  const m = await services.materials.getById(id);
  return m && !m.archived && (m.kind === "video" || m.kind === "audio") ? m : null;
}

async function snapshot(id: string) {
  const [transcript, subtitles] = await Promise.all([services.mediaText.getTranscript(id), services.mediaText.listSubtitles(id)]);
  return {
    sttConnected: speechConnected(),
    transcript: transcript ? { ...transcript, text: transcriptToText(transcript.segments) } : null,
    subtitles: subtitles.map((s) => ({ language: s.language, enabled: s.enabled })),
  };
}

/** GET /api/materials/[id]/media-text — transcript, subtitle tracks and whether speech-to-text is connected (staff). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await sessionOrNull(STAFF_ROLES))) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const { id } = await ctx.params;
  if (!(await mediaMaterial(id))) return json({ ok: false, code: "NOT_FOUND" }, 404);
  return json({ ok: true, ...(await snapshot(id)) });
}

/**
 * POST /api/materials/[id]/media-text
 *  • multipart (language, file)           upload a .vtt / .srt subtitle track (converted to clean WebVTT)
 *  • JSON {action: saveTranscript | generate | subtitleFromTranscript | toggleSubtitle | removeSubtitle | deleteTranscript}
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const session = await sessionOrNull(STAFF_ROLES);
  if (!session) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const { id } = await ctx.params;
  const material = await mediaMaterial(id);
  if (!material) return json({ ok: false, code: "NOT_FOUND" }, 404);
  const storage = getStorage();

  const putVtt = async (language: Locale, vtt: string) => {
    const file = new File([vtt], `${id}.${language}.vtt`, { type: "text/vtt" });
    const stored = await storage.put({ ownerId: session.user.id, file, mime: "text/vtt; charset=utf-8", status: "READY", attached: true });
    const replaced = await services.mediaText.putSubtitle(id, language, stored.id);
    if (replaced) await storage.delete(replaced).catch(() => undefined);
  };

  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const language = form?.get("language");
    const file = form?.get("file");
    if (!isLocale(language) || !(file instanceof File)) return json({ ok: false, code: "BAD_REQUEST" }, 400);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "vtt" && ext !== "srt") return json({ ok: false, code: "TYPE", types: ["vtt", "srt"] }, 422);
    if (file.size === 0) return json({ ok: false, code: "EMPTY" }, 422);
    if (file.size > MAX_SUBTITLE_BYTES) return json({ ok: false, code: "SIZE", max: MAX_SUBTITLE_BYTES }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.includes(0)) return json({ ok: false, code: "SIGNATURE" }, 422); // binary, not text
    const parsed = parseSubtitles(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    if (!parsed.ok) return json({ ok: false, code: parsed.code }, 422);
    await putVtt(language, cuesToVtt(parsed.cues));
    return json({ ok: true, ...(await snapshot(id)) });
  }

  const body = (await req.json().catch(() => null)) as { action?: string; language?: unknown; text?: unknown; enabled?: unknown } | null;
  const language = body?.language;
  switch (body?.action) {
    case "saveTranscript": {
      if (!isLocale(language) || typeof body.text !== "string" || body.text.length > 400_000) return json({ ok: false, code: "BAD_REQUEST" }, 400);
      const stored = body.text.trim() ? await storage.stat(material.fileId ?? "") : null;
      const parsed = parseTranscriptText(body.text, stored?.durationSeconds);
      if (!parsed.ok) return json({ ok: false, code: "BAD_LINE", line: parsed.line }, 422);
      if (!parsed.segments.length) { await services.mediaText.deleteTranscript(id); return json({ ok: true, ...(await snapshot(id)) }); }
      // an administrator-edited transcript keeps its provider history simple: it becomes "manual"
      await services.mediaText.saveTranscript({ materialId: id, language, status: "COMPLETED", provider: "manual", segments: parsed.segments });
      return json({ ok: true, ...(await snapshot(id)) });
    }
    case "generate": {
      if (!isLocale(language)) return json({ ok: false, code: "BAD_REQUEST" }, 400);
      const r = await requestTranscript(id, language);
      if (!r.ok) return json({ ok: false, code: r.code }, r.code === "STT_NOT_CONNECTED" ? 503 : 409);
      after(() => runTranscription(id).catch(() => undefined));
      return json({ ok: true, ...(await snapshot(id)) });
    }
    case "subtitleFromTranscript": {
      if (!isLocale(language)) return json({ ok: false, code: "BAD_REQUEST" }, 400);
      const t = await services.mediaText.getTranscript(id);
      if (!t || t.status !== "COMPLETED" || !t.segments.length) return json({ ok: false, code: "NO_TRANSCRIPT" }, 409);
      await putVtt(language, cuesToVtt(t.segments));
      return json({ ok: true, ...(await snapshot(id)) });
    }
    case "toggleSubtitle": {
      if (!isLocale(language) || typeof body.enabled !== "boolean") return json({ ok: false, code: "BAD_REQUEST" }, 400);
      if (!(await services.mediaText.setSubtitleEnabled(id, language, body.enabled))) return json({ ok: false, code: "NOT_FOUND" }, 404);
      return json({ ok: true, ...(await snapshot(id)) });
    }
    case "removeSubtitle": {
      if (!isLocale(language)) return json({ ok: false, code: "BAD_REQUEST" }, 400);
      const fileId = await services.mediaText.removeSubtitle(id, language);
      if (fileId) await storage.delete(fileId).catch(() => undefined);
      return json({ ok: true, ...(await snapshot(id)) });
    }
    case "deleteTranscript":
      await services.mediaText.deleteTranscript(id);
      return json({ ok: true, ...(await snapshot(id)) });
    default:
      return json({ ok: false, code: "BAD_REQUEST" }, 400);
  }
}
