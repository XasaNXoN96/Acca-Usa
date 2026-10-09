/**
 * Pure decision logic (no I/O) for the media pipeline: what ffprobe found → reject / play as is / transcode.
 * Browser compatibility is judged by container + codecs, NOT by file extension or MIME type.
 */
export interface Probe {
  /** ffprobe `format_name`, e.g. "mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm", "avi", "mp3", "ogg", "wav", "flac" */
  container: string;
  durationSeconds: number | null;
  video?: { codec: string; width: number; height: number; pixFmt?: string };
  audio?: { codec: string };
}

export type Plan =
  | { action: "reject"; code: "NO_VIDEO_STREAM" | "NO_AUDIO_STREAM" | "NO_DURATION" | "TOO_LONG" | "TOO_LARGE_RESOLUTION" }
  | { action: "passthrough" }
  | { action: "transcode"; target: "mp4" | "m4a" };

export const MAX_SECONDS = 6 * 60 * 60;
export const MAX_DIMENSION = 3840;

const has = (container: string, name: string) => container.split(",").includes(name);

export function planMedia(kind: "video" | "audio", ext: string, p: Probe): Plan {
  if (kind === "video" && !p.video) return { action: "reject", code: "NO_VIDEO_STREAM" };
  if (kind === "audio" && !p.audio) return { action: "reject", code: "NO_AUDIO_STREAM" };
  if (!p.durationSeconds || p.durationSeconds <= 0) return { action: "reject", code: "NO_DURATION" };
  if (p.durationSeconds > MAX_SECONDS) return { action: "reject", code: "TOO_LONG" };
  if (p.video && Math.max(p.video.width, p.video.height) > MAX_DIMENSION) return { action: "reject", code: "TOO_LARGE_RESOLUTION" };

  const a = p.audio?.codec;
  if (kind === "video") {
    const v = p.video!.codec;
    // 4:2:2 / 4:4:4 / 10-bit H.264 decodes in few browsers — only yuv420p is treated as playable as is.
    if (p.video!.pixFmt && p.video!.pixFmt !== "yuv420p") return { action: "transcode", target: "mp4" };
    const mp4Ok = (ext === "mp4" || ext === "m4v") && has(p.container, "mp4") && v === "h264" && (!a || a === "aac" || a === "mp3");
    const webmOk = ext === "webm" && has(p.container, "webm") && ["vp8", "vp9", "av1"].includes(v) && (!a || a === "opus" || a === "vorbis");
    return mp4Ok || webmOk ? { action: "passthrough" } : { action: "transcode", target: "mp4" };
  }
  const ok =
    (ext === "mp3" && has(p.container, "mp3")) ||
    (ext === "m4a" && has(p.container, "mp4") && a === "aac") ||
    (ext === "ogg" && has(p.container, "ogg") && (a === "vorbis" || a === "opus")) ||
    (ext === "wav" && has(p.container, "wav") && !!a?.startsWith("pcm_")) ||
    (ext === "flac" && has(p.container, "flac"));
  return ok ? { action: "passthrough" } : { action: "transcode", target: "m4a" };
}

/** Admin-facing explanation keys (translated in the UI). */
export const statusCodes = ["FFMPEG_NOT_AVAILABLE", "PROBE_FAILED", "TRANSCODE_FAILED", "TIMEOUT", "NO_VIDEO_STREAM", "NO_AUDIO_STREAM", "NO_DURATION", "TOO_LONG", "TOO_LARGE_RESOLUTION", "SOURCE_MISSING"] as const;
