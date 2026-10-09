import "server-only";
import type { MediaTextService } from "../contracts";
import { getDb, nowIso } from "./db";

export const mediaTextService: MediaTextService = {
  async getTranscript(materialId) {
    return getDb().transcripts.find((t) => t.materialId === materialId) ?? null;
  },
  async saveTranscript({ materialId, language, status, provider, segments, errorCode }) {
    const db = getDb();
    const rec = { materialId, language, status, provider, segments, errorCode, updatedAt: nowIso() };
    const i = db.transcripts.findIndex((t) => t.materialId === materialId);
    if (i >= 0) db.transcripts[i] = rec; else db.transcripts.push(rec);
  },
  async deleteTranscript(materialId) {
    const db = getDb();
    db.transcripts = db.transcripts.filter((t) => t.materialId !== materialId);
  },
  async listSubtitles(materialId) {
    return getDb().subtitles.filter((s) => s.materialId === materialId).sort((a, b) => a.language.localeCompare(b.language));
  },
  async putSubtitle(materialId, language, fileId) {
    const db = getDb();
    const old = db.subtitles.find((s) => s.materialId === materialId && s.language === language);
    if (old) { const prev = old.fileId; old.fileId = fileId; return prev; }
    db.subtitles.push({ materialId, language, fileId, enabled: true, createdAt: nowIso() });
    return null;
  },
  async setSubtitleEnabled(materialId, language, enabled) {
    const s = getDb().subtitles.find((x) => x.materialId === materialId && x.language === language);
    if (!s) return false;
    s.enabled = enabled;
    return true;
  },
  async removeSubtitle(materialId, language) {
    const db = getDb();
    const s = db.subtitles.find((x) => x.materialId === materialId && x.language === language);
    if (!s) return null;
    db.subtitles = db.subtitles.filter((x) => x !== s);
    return s.fileId;
  },
};
