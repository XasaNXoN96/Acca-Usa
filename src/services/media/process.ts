import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream, openAsBlob } from "node:fs";
import { mkdir, rm, stat as fsStat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { logEvent } from "@/lib/log";
import { getStorage } from "@/services/storage";
import type { StoredFileMeta } from "@/services/storage/contracts";
import { planMedia, type Plan, type Probe } from "./plan";
import { killAllTools, runTool } from "./tools";

/**
 * Media pipeline: UPLOADED → PROCESSING → READY | FAILED | REJECTED.
 *  1. the stored original is streamed to a temp file (never buffered in memory)
 *  2. ffprobe reads container / codecs / duration / size
 *  3. planMedia() decides: reject, play as is, or transcode (H.264/AAC MP4 or AAC M4A via FFmpeg)
 *  4. the rendition and a poster frame are stored as separate objects; the original keeps its id
 * Nothing is simulated: without ffmpeg the file stays FAILED (FFMPEG_NOT_AVAILABLE) and is not served.
 * The queue is the StoredFile status itself; `processPending()` is what a worker process runs.
 */
const MAX_ATTEMPTS = 3;
const PROBE_TIMEOUT = 60_000;
const TRANSCODE_TIMEOUT = Number(process.env.MEDIA_TRANSCODE_TIMEOUT_MS ?? 30 * 60_000);
/** A file that has been PROCESSING longer than a job can legitimately run belongs to a worker that died: it is claimed again. */
const STALE_PROCESSING_MS = (Number(process.env.MEDIA_STALE_MINUTES) || Math.ceil(TRANSCODE_TIMEOUT / 60_000) + 5) * 60_000;

let shuttingDown = false;
/** Worker shutdown: stops running ffmpeg; the file in flight goes back to UPLOADED so the next worker picks it up at once. */
export function requestShutdown(): void { shuttingDown = true; killAllTools(); }
export const isShuttingDown = () => shuttingDown;
const CONCURRENCY = Math.max(1, Number(process.env.MEDIA_CONCURRENCY ?? 1));

let running = 0;
const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>((r) => waiters.push(r));
  running += 1;
  try { return await fn(); } finally { running -= 1; waiters.shift()?.(); }
}

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

interface FfprobeJson {
  format?: { format_name?: string; duration?: string };
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; pix_fmt?: string }[];
}

export async function probeFile(path: string): Promise<{ ok: true; probe: Probe } | { ok: false; code: "FFMPEG_NOT_AVAILABLE" | "PROBE_FAILED" | "TIMEOUT" }> {
  const r = await runTool("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], PROBE_TIMEOUT);
  if (r.missing) return { ok: false, code: "FFMPEG_NOT_AVAILABLE" };
  if (r.timedOut) return { ok: false, code: "TIMEOUT" };
  if (r.code !== 0) return { ok: false, code: "PROBE_FAILED" };
  let j: FfprobeJson;
  try { j = JSON.parse(r.stdout) as FfprobeJson; } catch { return { ok: false, code: "PROBE_FAILED" }; }
  const v = j.streams?.find((s) => s.codec_type === "video" && s.codec_name !== "mjpeg" && s.codec_name !== "png");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration);
  return {
    ok: true,
    probe: {
      container: j.format?.format_name ?? "",
      durationSeconds: Number.isFinite(dur) && dur > 0 ? Math.max(1, Math.round(dur)) : null,
      video: v ? { codec: v.codec_name ?? "", width: v.width ?? 0, height: v.height ?? 0, pixFmt: v.pix_fmt } : undefined,
      audio: a ? { codec: a.codec_name ?? "" } : undefined,
    },
  };
}

export type ProcessResult = { status: "READY" | "FAILED" | "REJECTED" | "SKIPPED"; code?: string };

/** Processes one stored video / audio file. Safe to call twice: a file that is not UPLOADED / retryable is skipped. */
export function processFile(id: string): Promise<ProcessResult> {
  return slot(() => run(id));
}

async function run(id: string): Promise<ProcessResult> {
  const storage = getStorage();
  if (shuttingDown) return { status: "SKIPPED" };
  // Atomic claim: when the web process and a worker (or two workers) race for the same file, exactly one of them processes it.
  const meta = await storage.claim(id, { maxAttempts: MAX_ATTEMPTS, staleBefore: new Date(Date.now() - STALE_PROCESSING_MS) });
  if (!meta) return { status: "SKIPPED" };
  const kind = meta.mime.startsWith("video/") ? "video" : meta.mime.startsWith("audio/") ? "audio" : null;
  if (!kind) {
    await storage.update(id, { status: "READY", processedAt: new Date().toISOString() });
    return { status: "READY" };
  }
  const dir = join(process.env.MEDIA_TMP_DIR || tmpdir(), `acca-media-${randomUUID()}`);
  const fail = async (status: "FAILED" | "REJECTED", code: string): Promise<ProcessResult> => {
    if (shuttingDown) { // interrupted by a shutdown, not a failure of the file: give the attempt back and queue it again
      await storage.update(id, { status: "UPLOADED", statusCode: null, attempts: Math.max(0, (meta.attempts ?? 1) - 1) });
      return { status: "FAILED", code: "SHUTDOWN" };
    }
    await storage.update(id, { status, statusCode: code });
    return { status, code };
  };
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Free space: the original is copied to disk, the rendition is written next to it. Fail early and say why.
    const fsInfo = await statfs(dir).catch(() => null);
    if (fsInfo && Number(fsInfo.bavail) * Number(fsInfo.bsize) < meta.size * 3 + Number(process.env.MEDIA_MIN_FREE_MB ?? 128) * 1024 * 1024) return await fail("FAILED", "NO_DISK_SPACE");
    const src = join(dir, `source.${extOf(meta.name) || "bin"}`);
    const opened = await storage.open(id);
    if (!opened) return await fail("FAILED", "SOURCE_MISSING");
    await pipeline(Readable.fromWeb(opened.stream as never), createWriteStream(src, { mode: 0o600 }));

    const probed = await probeFile(src);
    if (!probed.ok) return await fail(probed.code === "PROBE_FAILED" ? "REJECTED" : "FAILED", probed.code);
    const probe = probed.probe;
    const plan: Plan = planMedia(kind, extOf(meta.name), probe);
    if (plan.action === "reject") return await fail("REJECTED", plan.code);

    const patch = {
      container: probe.container, videoCodec: probe.video?.codec ?? null, audioCodec: probe.audio?.codec ?? null,
      width: probe.video?.width ?? null, height: probe.video?.height ?? null, durationSeconds: probe.durationSeconds,
    };
    let playbackId: string | null = null;
    if (plan.action === "transcode") {
      const out = join(dir, plan.target === "mp4" ? "out.mp4" : "out.m4a");
      const args = plan.target === "mp4"
        ? ["-nostdin", "-y", "-i", src, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]
        : ["-nostdin", "-y", "-i", src, "-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out];
      const r = await runTool("ffmpeg", args, TRANSCODE_TIMEOUT);
      if (r.missing) return await fail("FAILED", "FFMPEG_NOT_AVAILABLE");
      if (r.timedOut) return await fail("FAILED", "TIMEOUT");
      const size = r.code === 0 ? (await fsStat(out).catch(() => null))?.size ?? 0 : 0;
      if (!size) return await fail("FAILED", "TRANSCODE_FAILED");
      const base = meta.name.replace(/\.[^.]+$/, "") || "media";
      const file = new File([await openAsBlob(out)], `${base}.${plan.target}`);
      const rendition = await storage.put({ ownerId: meta.ownerId, file, mime: plan.target === "mp4" ? "video/mp4" : "audio/mp4", durationSeconds: probe.durationSeconds ?? undefined, status: "READY", attached: true });
      playbackId = rendition.id;
    }

    let thumbId: string | null = null;
    if (kind === "video") {
      const thumb = join(dir, "poster.jpg");
      const at = String(Math.min(1, Math.max((probe.durationSeconds ?? 2) / 2 - 0.1, 0)));
      const r = await runTool("ffmpeg", ["-nostdin", "-y", "-ss", at, "-i", src, "-frames:v", "1", "-vf", "scale=640:-2", thumb], 60_000);
      const size = r.code === 0 ? (await fsStat(thumb).catch(() => null))?.size ?? 0 : 0;
      if (size) {
        const t = await storage.put({ ownerId: meta.ownerId, file: new File([await openAsBlob(thumb)], "poster.jpg"), mime: "image/jpeg", status: "READY", attached: true });
        thumbId = t.id;
      }
    }
    await storage.update(id, { ...patch, status: "READY", statusCode: null, processedAt: new Date().toISOString(), playbackFileId: playbackId, thumbnailFileId: thumbId });
    return { status: "READY" };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const code = err.code === "ENOSPC" ? "NO_DISK_SPACE" : /S3|Upload|NoSuchBucket|AccessDenied|ECONNREFUSED|ENOTFOUND/i.test(`${err.name} ${err.code}`) ? "STORAGE_ERROR" : "TRANSCODE_FAILED";
    logEvent("error", "media.process_failed", { id, code, error: err.name ?? "Error" });
    return await fail("FAILED", code);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Worker entry: process everything that is waiting (UPLOADED, and FAILED files that still have attempts left). */
export async function processPending(limit = 20): Promise<{ processed: number; results: Record<string, number> }> {
  const storage = getStorage();
  const staleBefore = Date.now() - STALE_PROCESSING_MS;
  const waiting = [
    ...(await storage.listByStatus(["UPLOADED"], limit)),
    ...(await storage.listByStatus(["PROCESSING"], limit)).filter((f) => new Date(f.processedAt ?? f.createdAt).getTime() < staleBefore), // a worker died mid-job
    ...(await storage.listByStatus(["FAILED"], limit)).filter((f) => (f.attempts ?? 0) < MAX_ATTEMPTS),
  ].slice(0, limit);
  const results: Record<string, number> = {};
  for (const f of waiting) {
    if (shuttingDown) break;
    const r = await processFile(f.id);
    results[r.status] = (results[r.status] ?? 0) + 1;
  }
  return { processed: waiting.length, results };
}

/** Admin retry: only a FAILED file (e.g. ffmpeg was missing) goes back to the queue; REJECTED content never does. */
export async function requeue(id: string): Promise<StoredFileMeta | null> {
  const meta = await getStorage().stat(id);
  if (!meta || meta.status !== "FAILED") return null;
  return getStorage().update(id, { status: "UPLOADED", statusCode: null, attempts: 0 });
}
