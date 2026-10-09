import "server-only";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { Locale } from "@/types";
import type { MediaTextService, TranscriptSegment } from "../contracts";

const segmentsOf = (v: unknown): TranscriptSegment[] =>
  Array.isArray(v) ? v.filter((x): x is TranscriptSegment => !!x && typeof x.start === "number" && typeof x.end === "number" && typeof x.text === "string") : [];

export const mediaTextService: MediaTextService = {
  async getTranscript(materialId) {
    const r = await getPrisma().transcript.findUnique({ where: { materialId } });
    return r ? { materialId, language: r.language as Locale, status: r.status, provider: r.provider, segments: segmentsOf(r.segments), errorCode: r.errorCode ?? undefined, updatedAt: r.updatedAt.toISOString() } : null;
  },
  async saveTranscript({ materialId, language, status, provider, segments, errorCode }) {
    const data = { language, status, provider, segments: segments as unknown as Prisma.InputJsonValue, errorCode: errorCode ?? null };
    await getPrisma().transcript.upsert({ where: { materialId }, create: { materialId, ...data }, update: data });
  },
  async deleteTranscript(materialId) {
    await getPrisma().transcript.deleteMany({ where: { materialId } });
  },
  async listSubtitles(materialId) {
    const rows = await getPrisma().subtitle.findMany({ where: { materialId }, orderBy: { language: "asc" } });
    return rows.map((r) => ({ materialId, language: r.language as Locale, fileId: r.fileId, enabled: r.enabled, createdAt: r.createdAt.toISOString() }));
  },
  async putSubtitle(materialId, language, fileId) {
    const old = await getPrisma().subtitle.findUnique({ where: { materialId_language: { materialId, language } } });
    await getPrisma().subtitle.upsert({ where: { materialId_language: { materialId, language } }, create: { materialId, language, fileId }, update: { fileId } });
    return old?.fileId ?? null;
  },
  async setSubtitleEnabled(materialId, language, enabled) {
    const r = await getPrisma().subtitle.updateMany({ where: { materialId, language }, data: { enabled } });
    return r.count > 0;
  },
  async removeSubtitle(materialId, language) {
    const old = await getPrisma().subtitle.findUnique({ where: { materialId_language: { materialId, language } } });
    if (!old) return null;
    await getPrisma().subtitle.delete({ where: { id: old.id } });
    return old.fileId;
  },
};
