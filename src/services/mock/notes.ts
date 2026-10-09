import "server-only";
import { routes } from "@/lib/routes";
import type { NoteListItem, NoteService, NoteView } from "../contracts";
import { NOTES_PER_USER, checkNote } from "../domain/notes";
import { materialLive } from "../domain/records";
import { topicsWithStatus } from "../domain/calc";
import { getDb, newId, nowIso } from "./db";

const view = ({ userId: _u, ...n }: NoteView & { userId: string }): NoteView => n;

export const noteService: NoteService = {
  async listForMaterial(userId, materialId) {
    return getDb().notes.filter((n) => n.userId === userId && n.materialId === materialId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(view);
  },
  async listForUser(userId, q) {
    const db = getDb();
    const needle = q?.trim().toLowerCase();
    const out: NoteListItem[] = [];
    for (const n of db.notes.filter((x) => x.userId === userId)) {
      const m = db.materials.find((x) => x.id === n.materialId);
      if (!m) continue;
      if (needle && !n.body.toLowerCase().includes(needle) && !m.title.toLowerCase().includes(needle)) continue;
      let href: string | undefined;
      if (m.topicId && materialLive(m) && !db.subjects.find((s) => s.slug === m.subjectSlug)?.deletedAt) {
        const topic = topicsWithStatus(db, userId, m.subjectSlug).find((t) => t.id === m.topicId);
        if (topic && topic.status !== "locked") href = routes.subjectMaterial(m.subjectSlug, m.topicId, m.id);
      }
      out.push({ ...view(n), materialTitle: m.title, href });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async create(userId, input) {
    const db = getDb();
    if (checkNote(input)) return { ok: false, code: "INVALID" };
    if (!db.materials.some((m) => m.id === input.materialId && !m.deletedAt)) return { ok: false, code: "NOT_FOUND" };
    if (db.notes.filter((n) => n.userId === userId).length >= NOTES_PER_USER) return { ok: false, code: "LIMIT" };
    const now = nowIso();
    const rec = { id: newId("note"), userId, materialId: input.materialId, body: input.body.trim(), pdfPage: input.pdfPage, videoSeconds: input.videoSeconds, createdAt: now, updatedAt: now };
    db.notes.push(rec);
    return { ok: true, data: view(rec) };
  },
  async update(userId, noteId, body) {
    const n = getDb().notes.find((x) => x.id === noteId && x.userId === userId); // someone else's note is simply "not found"
    if (!n) return { ok: false, code: "NOT_FOUND" };
    if (checkNote({ body })) return { ok: false, code: "INVALID" };
    n.body = body.trim(); n.updatedAt = nowIso();
    return { ok: true, data: view(n) };
  },
  async remove(userId, noteId) {
    const db = getDb();
    if (!db.notes.some((x) => x.id === noteId && x.userId === userId)) return { ok: false, code: "NOT_FOUND" };
    db.notes = db.notes.filter((x) => x.id !== noteId);
    return { ok: true, data: undefined };
  },
};
