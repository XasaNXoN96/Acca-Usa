import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { TestResult } from "@/types";
import { createMistakeService } from "../domain/mistakes";

export const mistakeService = createMistakeService({
  async results(userId) {
    const rows = await getPrisma().testAttempt.findMany({ where: { userId, status: "SUBMITTED" }, select: { result: true }, orderBy: { submittedAt: "asc" } });
    return rows.map((r) => r.result as unknown as TestResult | null).filter((r): r is TestResult => !!r && Array.isArray(r.review));
  },
  async practice(userId) {
    const rows = await getPrisma().practiceAnswer.findMany({ where: { userId }, orderBy: { at: "asc" } });
    return rows.map((r) => ({ questionId: r.questionId, correct: r.correct, at: r.at.toISOString() }));
  },
  async bank(questionId) {
    const q = await getPrisma().question.findFirst({ where: { id: questionId, deletedAt: null, status: "published" } });
    return q ? { text: q.text, options: q.options as unknown as { id: string; text: string }[], correctOptionId: q.correctOptionId, explanation: q.explanation, imageId: q.imageId ?? undefined } : null;
  },
  async record(userId, questionId, correct) {
    await getPrisma().practiceAnswer.create({ data: { userId, questionId, correct } });
  },
});
