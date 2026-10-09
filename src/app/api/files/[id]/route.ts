import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { services } from "@/services";
import { getStorage } from "@/services/storage";
import { inlineMimes } from "@/services/storage/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return "invalid";
  if (Number.isNaN(start)) { start = Math.max(size - end, 0); end = size - 1; }
  else if (Number.isNaN(end) || end >= size) end = size - 1;
  return start > end || start >= size ? "invalid" : { start, end };
}

/**
 * GET /api/files/[id]
 * Signed-in users only. Students may read a file only if it is attached to a visible material of a platform
 * they are enrolled in. Supports HTTP Range (video/audio seeking). Never trusts a stored/declared type for inline rendering.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Plain-text errors in the viewer's language (the browser may show them directly, e.g. an opened download link).
  const fail = async (status: number, key: "fileUnauthorized" | "fileForbidden" | "fileNotFound" | "fileRange" | "fileViewOnly", headers?: HeadersInit) =>
    new Response((await getTranslations("states"))(key), { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers } });
  const session = await getSession();
  if (!session) return fail(401, "fileUnauthorized");
  const { id } = await ctx.params;
  const storage = getStorage();
  const meta = await storage.stat(id);
  if (!meta) return fail(404, "fileNotFound");

  const isStudent = session.user.role === "STUDENT";
  // VIEW-ONLY policy, enforced here (hiding buttons is not protection): students never get an attachment / download
  // response, and file types a browser cannot display inline (office files, archives, …) are not served to them at all.
  if (isStudent && new URL(req.url).searchParams.has("download")) return fail(403, "fileViewOnly");
  if (isStudent && !inlineMimes.has(meta.mime) && !/^text\/(plain|csv)/.test(meta.mime)) return fail(403, "fileViewOnly");

  if (isStudent) {
    const material = await services.materials.getByFileId(id);
    if (material) {
      const subject = await services.subjects.getBySlug(material.subjectSlug);
      if (!subject) return fail(404, "fileNotFound");
      if (!(await services.enrollments.isEnrolled(session.user.id, subject.platform))) return fail(403, "fileForbidden");
      if (material.topicId) {
        const tctx = await services.topics.getContext(material.topicId, session.user.id);
        if (!tctx || tctx.topic.status === "locked") return fail(403, "fileForbidden");
      }
    } else {
      // Not a material file: a question illustration is readable only for a published question in a published test
      // of a platform the student is enrolled in.
      const access = await services.questions.imageAccess(id);
      const subject = access && (await services.subjects.getBySlug(access.subjectSlug));
      if (!subject) return fail(404, "fileNotFound");
      if (!(await services.enrollments.isEnrolled(session.user.id, subject.platform))) return fail(403, "fileForbidden");
    }
  }

  const range = parseRange(req.headers.get("range"), meta.size);
  if (range === "invalid") return fail(416, "fileRange", { "Content-Range": `bytes */${meta.size}` });

  const opened = await storage.open(id, range ?? undefined);
  if (!opened) return fail(404, "fileNotFound");

  const url = new URL(req.url);
  const inline = isStudent || (inlineMimes.has(meta.mime) && url.searchParams.get("download") !== "1");
  const headers = new Headers({
    "Content-Type": meta.mime,
    "Content-Length": String(opened.end - opened.start + 1),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
  });
  if (range) headers.set("Content-Range", `bytes ${opened.start}-${opened.end}/${meta.size}`);
  return new Response(opened.stream, { status: range ? 206 : 200, headers });
}
