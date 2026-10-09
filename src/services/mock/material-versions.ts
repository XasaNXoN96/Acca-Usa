import "server-only";
import type { MaterialVersionService } from "../contracts";
import { contentChanged } from "../domain/records";
import { getStorage } from "../storage";
import { getDb } from "./db";
import { snapshotVersion } from "./catalog";

export const materialVersionService: MaterialVersionService = {
  async list(materialId) {
    const storage = getStorage();
    const rows = getDb().materialVersions.filter((v) => v.materialId === materialId).reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Promise.all(rows.map(async (v) => {
      const f = v.fileId ? await storage.stat(v.fileId) : null;
      return {
        id: v.id, materialId, kind: v.kind, title: v.title, fileId: v.fileId, fileName: f?.name, fileMime: f?.mime ?? v.fileMime, fileSize: f?.size, fileStatus: f ? (f.status ?? "READY") : undefined,
        bodyPreview: v.body ? v.body.slice(0, 160) : undefined, createdAt: v.createdAt, createdById: v.createdById,
      };
    }));
  },
  async restore(materialId, versionId, actorId) {
    const db = getDb();
    const rec = db.materials.find((m) => m.id === materialId);
    const ver = db.materialVersions.find((v) => v.id === versionId && v.materialId === materialId);
    if (!rec || !ver) return { ok: false, code: "NOT_FOUND" };
    if (ver.fileId) {
      const f = await getStorage().stat(ver.fileId);
      if (!f) return { ok: false, code: "FILE_REQUIRED", field: "fileId" };
      if ((f.status ?? "READY") !== "READY") return { ok: false, code: "FILE_NOT_READY", field: "fileId" };
    }
    if (contentChanged(rec, ver)) await snapshotVersion(db, rec, actorId); // the state being replaced is kept
    db.materialVersions = db.materialVersions.filter((v) => v.id !== versionId);
    Object.assign(rec, { kind: ver.kind, fileId: ver.fileId, body: ver.body });
    if (ver.fileId) await getStorage().markAttached(ver.fileId, true);
    return { ok: true, data: undefined };
  },
};
