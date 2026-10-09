import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat as fsStat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Locale } from "@/types";
import { services } from "@/services";
import { runTool } from "../media/tools";
import { getStorage } from "../storage";
import { SttError } from "./contracts";
import { getSpeechProvider } from "./index";

export type RequestResult = { ok: true } | { ok: false; code: "STT_NOT_CONNECTED" | "NOT_FOUND" | "NOT_MEDIA" | "FILE_NOT_READY" | "ALREADY_RUNNING" };

/** Validates and queues a transcription. Without a configured provider nothing is queued: NOT CONNECTED. */
export async function requestTranscript(materialId: string, language: Locale): Promise<RequestResult> {
  const provider = getSpeechProvider();
  if (!provider) return { ok: false, code: "STT_NOT_CONNECTED" };
  const material = await services.materials.getById(materialId);
  if (!material || material.archived) return { ok: false, code: "NOT_FOUND" };
  if ((material.kind !== "video" && material.kind !== "audio") || !material.fileId) return { ok: false, code: "NOT_MEDIA" };
  if ((material.fileStatus ?? "READY") !== "READY") return { ok: false, code: "FILE_NOT_READY" };
  const current = await services.mediaText.getTranscript(materialId);
  if (current && (current.status === "QUEUED" || current.status === "PROCESSING")) return { ok: false, code: "ALREADY_RUNNING" };
  await services.mediaText.saveTranscript({ materialId, language, status: "QUEUED", provider: provider.name, segments: current?.segments ?? [] });
  return { ok: true };
}

/** Runs a queued transcription (called from after() / a worker). Never invents text: failures are recorded as FAILED. */
export async function runTranscription(materialId: string): Promise<void> {
  const rec = await services.mediaText.getTranscript(materialId);
  const provider = getSpeechProvider();
  if (!rec || rec.status !== "QUEUED") return;
  const failWith = (errorCode: string) => services.mediaText.saveTranscript({ materialId, language: rec.language, status: "FAILED", provider: rec.provider, segments: rec.segments, errorCode });
  if (!provider) return failWith("STT_NOT_CONNECTED");
  const material = await services.materials.getById(materialId);
  if (!material?.fileId) return failWith("NOT_FOUND");
  await services.mediaText.saveTranscript({ materialId, language: rec.language, status: "PROCESSING", provider: rec.provider, segments: rec.segments });

  const dir = join(process.env.MEDIA_TMP_DIR || tmpdir(), `acca-stt-${randomUUID()}`);
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const storage = getStorage();
    const meta = await storage.stat(material.fileId);
    const opened = await storage.open(meta?.playbackFileId ?? material.fileId);
    if (!opened) return await failWith("SOURCE_MISSING");
    const src = join(dir, "source.bin");
    await pipeline(Readable.fromWeb(opened.stream as never), createWriteStream(src, { mode: 0o600 }));
    const audio = join(dir, "audio.mp3");
    const r = await runTool("ffmpeg", ["-nostdin", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audio], 10 * 60_000);
    if (r.missing) return await failWith("FFMPEG_NOT_AVAILABLE");
    if (r.code !== 0 || !((await fsStat(audio).catch(() => null))?.size)) return await failWith("TRANSCODE_FAILED");
    const segments = await provider.transcribe({ audioPath: audio, language: rec.language });
    await services.mediaText.saveTranscript({ materialId, language: rec.language, status: "COMPLETED", provider: provider.name, segments });
  } catch (e) {
    await failWith(e instanceof SttError ? e.code : "STT_REQUEST_FAILED");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
