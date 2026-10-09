import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { MaterialStatsService } from "../contracts";
import { buildMaterialStats } from "../domain/material-stats";
import { getStorage } from "../storage";

export const materialStatsService: MaterialStatsService = {
  async get(filter) {
    const prisma = getPrisma();
    const storage = getStorage();
    const [rows, views, done, attempts] = await Promise.all([
      prisma.material.findMany({ include: { subject: { include: { level: true } }, topic: { select: { title: true } } } }),
      prisma.materialView.findMany({ where: { user: { role: "STUDENT", deletedAt: null } }, select: { materialId: true, userId: true, at: true } }),
      prisma.materialProgress.findMany({ where: { user: { role: "STUDENT", deletedAt: null } }, select: { materialId: true, userId: true, completedAt: true } }),
      prisma.testAttempt.findMany({ where: { status: "SUBMITTED", submittedAt: { not: null }, user: { role: "STUDENT", deletedAt: null }, test: { kind: "topic_test", deletedAt: null } }, select: { scorePercent: true, submittedAt: true, test: { select: { topicId: true } } } }),
    ]);
    const materials = await Promise.all(rows.map(async (m) => {
      const f = m.fileId ? await storage.stat(m.fileId) : null;
      return {
        id: m.id, title: m.title, kind: m.kind, subjectSlug: m.subjectSlug, subjectCode: m.subject.code, platform: m.subject.level.platformSlug as "acca" | "fia",
        topicId: m.topicId ?? undefined, topicTitle: m.topic?.title, published: m.published, publishAt: m.publishAt?.toISOString(), archived: !!m.deletedAt,
        fileStatus: f ? (f.status ?? "READY") : undefined, errorCode: f?.statusCode,
      };
    }));
    return buildMaterialStats({
      filter, materials,
      views: views.map((v) => ({ materialId: v.materialId, userId: v.userId, at: v.at.toISOString() })),
      completions: done.map((c) => ({ materialId: c.materialId, userId: c.userId, at: c.completedAt.toISOString() })),
      attempts: attempts.map((a) => ({ topicId: a.test.topicId ?? undefined, scorePercent: a.scorePercent ?? 0, at: a.submittedAt!.toISOString() })),
    });
  },
};
