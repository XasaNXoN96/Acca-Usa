"use server";

import { z } from "zod";
import { sessionOrNull } from "@/lib/auth/guards";
import { canReadMaterial } from "@/lib/material-access";
import { services } from "@/services";
import type { NoteView } from "@/services/contracts";

/**
 * Private student notes. Every action re-checks on the server: signed-in STUDENT, and for new notes that the student may
 * read the material (enrolment + unlocked topic + published). Editing / deleting is scoped to the owner inside the service.
 */
export type NoteResult = { ok: true; note?: NoteView } | { ok: false; code: "FORBIDDEN" | "INVALID" | "LIMIT" | "FAILED" };

const body = z.string().trim().min(1).max(2000);
const createInput = z.object({
  materialId: z.string().min(1).max(200),
  body,
  pdfPage: z.number().int().min(1).max(10_000).optional(),
  videoSeconds: z.number().int().min(0).max(86_400).optional(),
}).refine((v) => v.pdfPage === undefined || v.videoSeconds === undefined);

async function student() {
  const session = await sessionOrNull();
  return session && session.user.role === "STUDENT" ? session : null;
}

export async function createNoteAction(raw: unknown): Promise<NoteResult> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const session = await student();
  if (!session) return { ok: false, code: "FORBIDDEN" };
  if ((await canReadMaterial(session, parsed.data.materialId)) !== "ok") return { ok: false, code: "FORBIDDEN" };
  const res = await services.notes.create(session.user.id, parsed.data);
  if (res.ok) return { ok: true, note: res.data };
  return { ok: false, code: res.code === "LIMIT" ? "LIMIT" : res.code === "INVALID" ? "INVALID" : "FAILED" };
}

export async function updateNoteAction(raw: unknown): Promise<NoteResult> {
  const parsed = z.object({ noteId: z.string().min(1).max(100), body }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const session = await student();
  if (!session) return { ok: false, code: "FORBIDDEN" };
  const res = await services.notes.update(session.user.id, parsed.data.noteId, parsed.data.body);
  return res.ok ? { ok: true, note: res.data } : { ok: false, code: res.code === "NOT_FOUND" ? "FORBIDDEN" : "FAILED" };
}

export async function deleteNoteAction(raw: unknown): Promise<NoteResult> {
  const parsed = z.object({ noteId: z.string().min(1).max(100) }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const session = await student();
  if (!session) return { ok: false, code: "FORBIDDEN" };
  const res = await services.notes.remove(session.user.id, parsed.data.noteId);
  return res.ok ? { ok: true } : { ok: false, code: "FORBIDDEN" };
}
