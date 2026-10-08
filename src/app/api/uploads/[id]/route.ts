import { json, sameOrigin } from "@/lib/api-guards";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { getStorage } from "@/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/uploads/[id] — removes an upload that is not attached to any material yet (owner or admin). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const session = await sessionOrNull(STAFF_ROLES);
  if (!session) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const { id } = await ctx.params;
  const storage = getStorage();
  const meta = await storage.stat(id);
  if (!meta) return json({ ok: true });
  if (meta.attached) return json({ ok: false, code: "ATTACHED" }, 409);
  if (meta.ownerId !== session.user.id && session.user.role !== "ADMIN") return json({ ok: false, code: "FORBIDDEN" }, 403);
  await storage.delete(id);
  return json({ ok: true });
}
