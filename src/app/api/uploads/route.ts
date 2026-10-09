import { after } from "next/server";
import { json, sameOrigin } from "@/lib/api-guards";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rate-limit";
import { processFile } from "@/services/media/process";
import { getStorage } from "@/services/storage";
import { readMediaInfo } from "@/services/storage/media-info";
import { uploadKinds, uploadRules, validateUpload, type UploadKind } from "@/services/storage/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 160 * 1024 * 1024;

/**
 * POST /api/uploads  (multipart: kind, file)
 * Staff only. Every file is validated server-side: kind allow-list, extension, size cap and magic bytes.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const session = await sessionOrNull(STAFF_ROLES);
  if (!session) return json({ ok: false, code: "FORBIDDEN" }, 403);

  const rl = await rateLimit(`upload:${session.user.id}`, 60, 60 * 60_000);
  if (!rl.ok) return json({ ok: false, code: "RATE_LIMITED" }, 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ ok: false, code: "SIZE" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, code: "BAD_REQUEST" }, 400);
  }
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if (!(uploadKinds as readonly string[]).includes(kind) || !(file instanceof File)) return json({ ok: false, code: "BAD_REQUEST" }, 400);

  const check = await validateUpload(kind as UploadKind, file);
  if (!check.ok) return json({ ok: false, code: check.code, max: uploadRules[kind as UploadKind].maxBytes, types: uploadRules[kind as UploadKind].exts }, check.code === "SIZE" ? 413 : 422);

  // Duration of video / audio, read from the container header (best effort; unknown stays unknown).
  const media = kind === "video" || kind === "audio" ? await readMediaInfo(file, check.ext) : null;
  // Video / audio are not served until the media pipeline (ffprobe + FFmpeg) has validated them: UPLOADED → … → READY.
  const needsProcessing = kind === "video" || kind === "audio";
  const stored = await getStorage().put({ ownerId: session.user.id, file, mime: check.mime, durationSeconds: media?.durationSeconds, status: needsProcessing ? "UPLOADED" : "READY" });
  if (needsProcessing) after(() => processFile(stored.id).catch(() => undefined));
  return json({ ok: true, file: { id: stored.id, name: stored.name, mime: stored.mime, size: stored.size, durationSeconds: stored.durationSeconds, status: stored.status ?? "READY" } });
}
