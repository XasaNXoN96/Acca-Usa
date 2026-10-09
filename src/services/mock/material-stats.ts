import "server-only";
import type { MaterialStatsService } from "../contracts";
import { buildMaterialStats } from "../domain/material-stats";
import { getStorage } from "../storage";
import { getDb, platformOfSubject } from "./db";

export const materialStatsService: MaterialStatsService = {
  async get(filter) {
    const db = getDb();
    const storage = getStorage();
    const students = new Set(db.users.filter((u) => u.role === "STUDENT" && !u.deletedAt).map((u) => u.id));
    const materials = await Promise.all(db.materials.map(async (m) => {
      const subject = db.subjects.find((s) => s.slug === m.subjectSlug);
      const f = m.fileId ? await storage.stat(m.fileId) : null;
      return {
        id: m.id, title: m.title, kind: m.kind, subjectSlug: m.subjectSlug, subjectCode: subject?.code ?? m.subjectSlug, platform: subject ? platformOfSubject(db, subject) : "acca" as const,
        topicId: m.topicId, topicTitle: db.topics.find((t) => t.id === m.topicId)?.title, published: m.published !== false, publishAt: m.publishAt, archived: !!m.deletedAt,
        fileStatus: f ? (f.status ?? "READY") : undefined, errorCode: f?.statusCode,
      };
    }));
    const testTopic = new Map(db.tests.filter((t) => !t.deletedAt).map((t) => [t.id, t.topicId]));
    return buildMaterialStats({
      filter, materials,
      views: db.materialViews.filter((v) => students.has(v.userId)),
      completions: db.materialProgress.filter((p) => students.has(p.userId)).map((p) => ({ materialId: p.materialId, userId: p.userId, at: p.completedAt })),
      attempts: db.attempts.filter((a) => a.result && a.submittedAt && students.has(a.userId) && testTopic.has(a.testId)).map((a) => ({ topicId: testTopic.get(a.testId), scorePercent: a.result!.scorePercent, at: a.submittedAt! })),
    });
  },
};
