import "server-only";
import { reviewState } from "../domain/exams";
import { createMistakeService } from "../domain/mistakes";
import { getDb, nowIso } from "./db";

export const mistakeService = createMistakeService({
  async results(userId) {
    const db = getDb();
    // an exam whose review is hidden (NEVER / until it closes) must not leak its answers through "my mistakes"
    return db.attempts.filter((a) => a.userId === userId && a.status === "SUBMITTED" && a.result && reviewState(db.tests.find((t) => t.id === a.testId) ?? {}) === "visible").map((a) => a.result!);
  },
  async practice(userId) {
    return getDb().practiceAnswers.filter((p) => p.userId === userId);
  },
  async bank(questionId) {
    const q = getDb().questions.find((x) => x.id === questionId && !x.deletedAt && x.status === "published");
    return q ? { text: q.text, options: q.options, correctOptionId: q.correctOptionId, explanation: q.explanation, imageId: q.imageId } : null;
  },
  async record(userId, questionId, correct) {
    getDb().practiceAnswers.push({ userId, questionId, correct, at: nowIso() });
  },
});
