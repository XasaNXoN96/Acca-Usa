"use server";

import { revalidatePath } from "next/cache";
import { adminActor, audit } from "@/lib/audit";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { IMPORT_MAX_BYTES, mapQuestions, parseCsv, type ImportError } from "@/lib/question-import";
import { services } from "@/services";
import { invalidateCatalog } from "@/services/prisma/catalog-cache";

export type QuestionImportResult =
  | { ok: false; code: "FORBIDDEN" | "RATE_LIMITED" | "TOO_BIG" | "EMPTY" | "NO_HEADER" | "MISSING_COLUMNS" | "TOO_MANY_ROWS"; missing?: string[] }
  | { ok: true; dryRun: boolean; rows: number; valid: number; imported: number; duplicates: number[]; errors: ImportError[] };

/**
 * Admin → Question bank → Import. Two calls with the same text: `dryRun: true` only checks and reports, `dryRun: false` creates the
 * valid questions as DRAFTS (an administrator publishes them after review). Every row is validated by the same rules as the form.
 */
export async function importQuestionsAction(input: { csv: string; dryRun: boolean }): Promise<QuestionImportResult> {
  const session = await sessionOrNull(STAFF_ROLES);
  if (!session || !can(session.user.role, "manage_tests")) return { ok: false, code: "FORBIDDEN" };
  if (typeof input?.csv !== "string" || Buffer.byteLength(input.csv, "utf8") > IMPORT_MAX_BYTES) return { ok: false, code: "TOO_BIG" };
  const rl = await rateLimit(`qimport:${session.user.id}`, input.dryRun ? 60 : 20, 60 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };

  const [subjects, topics, existing] = await Promise.all([services.subjects.listAll(), services.topics.listAll(), services.questions.list()]);
  const plan = mapQuestions(parseCsv(input.csv), {
    subjects: subjects.filter((s) => !s.archived).map((s) => ({ slug: s.slug, code: s.code })),
    topics: topics.filter((t) => !t.archived).map((t) => ({ id: t.id, subjectSlug: t.subjectSlug, title: t.title })),
    existing: existing.filter((q) => q.status !== "archived").map((q) => ({ subjectSlug: q.subjectSlug, text: q.text })),
  });
  if (plan.fileProblem) return { ok: false, code: plan.fileProblem === "EMPTY" ? "EMPTY" : plan.fileProblem, missing: plan.missing };

  const errors = [...plan.errors];
  let imported = 0;
  if (!input.dryRun) {
    for (const q of plan.questions) {
      const res = await services.questions.create({ subjectSlug: q.subjectSlug, topicId: q.topicId, tags: q.tags, status: "draft", text: q.text, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, points: q.points, difficulty: q.difficulty });
      if (res.ok) imported++; else errors.push({ line: q.line, code: "SAVE_FAILED" });
    }
    invalidateCatalog();
    await audit({ actor: adminActor(session.user), action: "question-bank.import", target: { type: "question-bank" }, meta: { rows: plan.rows, imported, skippedErrors: errors.length, duplicates: plan.duplicates.length } });
    revalidatePath("/admin/question-bank");
    revalidatePath("/admin");
  }
  return { ok: true, dryRun: input.dryRun, rows: plan.rows, valid: plan.questions.length, imported, duplicates: plan.duplicates.slice(0, 200), errors: errors.slice(0, 200) };
}
