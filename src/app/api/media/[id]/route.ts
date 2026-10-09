import { after } from "next/server";
import { json, sameOrigin } from "@/lib/api-guards";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { processFile, requeue } from "@/services/media/process";
import { mediaToolsAvailable } from "@/services/media/tools";
import { getStorage } from "@/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (m: NonNullable<Awaited<ReturnType<ReturnType<typeof getStorage>["stat"]>>>) => ({
  id: m.id, status: m.status ?? "READY", code: m.statusCode ?? null, attempts: m.attempts ?? 0, durationSeconds: m.durationSeconds ?? null,
  container: m.container ?? null, videoCodec: m.videoCodec ?? null, audioCodec: m.audioCodec ?? null, width: m.width ?? null, height: m.height ?? null,
  transcoded: !!m.playbackFileId, hasThumbnail: !!m.thumbnailFileId,
});

/** GET /api/media/[id] — processing status of an uploaded video / audio file (staff only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await sessionOrNull(STAFF_ROLES))) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const meta = await getStorage().stat((await ctx.params).id);
  return meta ? json({ ok: true, ...view(meta) }) : json({ ok: false, code: "NOT_FOUND" }, 404);
}

/** POST /api/media/[id] — retry a FAILED file (REJECTED content is never retried). Also reports whether FFmpeg is installed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ ok: false, code: "FORBIDDEN" }, 403);
  if (!(await sessionOrNull(STAFF_ROLES))) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const { id } = await ctx.params;
  const queued = await requeue(id);
  if (!queued) return json({ ok: false, code: "NOT_RETRYABLE", ffmpeg: await mediaToolsAvailable() }, 409);
  after(() => processFile(id).catch(() => undefined));
  return json({ ok: true, ...view(queued) });
}
