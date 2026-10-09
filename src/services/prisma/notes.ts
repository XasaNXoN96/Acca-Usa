import "server-only";
import type { MaterialNote } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { routes } from "@/lib/routes";
import type { NoteListItem, NoteService, NoteView } from "../contracts";
import { topicsWithStatus } from "../domain/calc";
import { NOTES_PER_USER, checkNote } from "../domain/notes";
import { materialLive } from "../domain/records";
import { loadCalcDbForRead } from "./load";

const view = (n: MaterialNote): NoteView => ({
  id: n.id, materialId: n.materialId, body: n.body, pdfPage: n.pdfPage ?? undefined, videoSeconds: n.videoSeconds ?? undefined,
  createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString(),
});

export const noteService: NoteService = {
  async listForMaterial(userId, materialId) {
    return (await getPrisma().materialNote.findMany({ where: { userId, materialId }, orderBy: { createdAt: "asc" } })).map(view);
  },
  async listForUser(userId, q) {
    const needle = q?.trim();
    const rows = await getPrisma().materialNote.findMany({
      where: { userId, ...(needle ? { OR: [{ body: { contains: needle, mode: "insensitive" } }, { material: { title: { contains: needle, mode: "insensitive" } } }] } : {}) },
      include: { material: true }, orderBy: { updatedAt: "desc" }, take: 500,
    });
    if (!rows.length) return [];
    const calc = await loadCalcDbForRead([userId]);
    const out: NoteListItem[] = [];
    for (const n of rows) {
      const m = n.material;
      let href: string | undefined;
      if (m.topicId && materialLive({ deletedAt: m.deletedAt?.toISOString(), published: m.published, publishAt: m.publishAt?.toISOString() })) {
        const topic = topicsWithStatus(calc, userId, m.subjectSlug).find((t) => t.id === m.topicId);
        if (topic && topic.status !== "locked") href = routes.subjectMaterial(m.subjectSlug, m.topicId, m.id);
      }
      out.push({ ...view(n), materialTitle: m.title, href });
    }
    return out;
  },
  async create(userId, input) {
    const prisma = getPrisma();
    if (checkNote(input)) return { ok: false, code: "INVALID" };
    if (!(await prisma.material.findFirst({ where: { id: input.materialId, deletedAt: null }, select: { id: true } }))) return { ok: false, code: "NOT_FOUND" };
    if ((await prisma.materialNote.count({ where: { userId } })) >= NOTES_PER_USER) return { ok: false, code: "LIMIT" };
    const n = await prisma.materialNote.create({ data: { userId, materialId: input.materialId, body: input.body.trim(), pdfPage: input.pdfPage ?? null, videoSeconds: input.videoSeconds ?? null } });
    return { ok: true, data: view(n) };
  },
  async update(userId, noteId, body) {
    if (checkNote({ body })) return { ok: false, code: "INVALID" };
    const r = await getPrisma().materialNote.updateMany({ where: { id: noteId, userId }, data: { body: body.trim() } }); // scoped by owner
    if (!r.count) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, data: view((await getPrisma().materialNote.findUniqueOrThrow({ where: { id: noteId } }))) };
  },
  async remove(userId, noteId) {
    const r = await getPrisma().materialNote.deleteMany({ where: { id: noteId, userId } });
    return r.count ? { ok: true, data: undefined } : { ok: false, code: "NOT_FOUND" };
  },
};
