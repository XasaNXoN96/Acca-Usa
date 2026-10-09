import { getSession } from "@/lib/auth/session";
import { canReadMaterial } from "@/lib/material-access";
import { services } from "@/services";
import { getStorage } from "@/services/storage";
import { locales } from "@/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/materials/[id]/subtitles/[lang] — WebVTT track; same access rule as the material's file (enrolment + unlocked topic). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; lang: string }> }) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  const { id, lang } = await ctx.params;
  if (!(locales as readonly string[]).includes(lang)) return new Response(null, { status: 404 });
  const access = await canReadMaterial(session, id);
  if (access === "notfound") return new Response(null, { status: 404 });
  if (access === "forbidden") return new Response(null, { status: 403 });
  const track = (await services.mediaText.listSubtitles(id)).find((s) => s.language === lang && s.enabled);
  const opened = track && (await getStorage().open(track.fileId));
  if (!opened) return new Response(null, { status: 404 });
  return new Response(opened.stream, { headers: { "Content-Type": "text/vtt; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Length": String(opened.end - opened.start + 1) } });
}
