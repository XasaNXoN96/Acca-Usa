import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { MaterialVersionService } from "../contracts";
import { contentChanged } from "../domain/records";
import { getStorage } from "../storage";
import { snapshotVersion } from "./catalog";

export const materialVersionService: MaterialVersionService = {
  async list(materialId) {
    const storage = getStorage();
    const rows = await getPrisma().materialVersion.findMany({ where: { materialId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return Promise.all(rows.map(async (v) => {
      const f = v.fileId ? await storage.stat(v.fileId) : null;
      return {
        id: v.id, materialId, kind: v.kind, title: v.title, fileId: v.fileId ?? undefined, fileName: f?.name, fileMime: f?.mime ?? v.fileMime ?? undefined, fileSize: f?.size,
        fileStatus: f ? (f.status ?? "READY") : undefined, bodyPreview: v.body ? v.body.slice(0, 160) : undefined, createdAt: v.createdAt.toISOString(), createdById: v.createdById ?? undefined,
      };
    }));
  },
  async restore(materialId, versionId, actorId) {
    const prisma = getPrisma();
    const rec = await prisma.material.findUnique({ where: { id: materialId } });
    const ver = await prisma.materialVersion.findFirst({ where: { id: versionId, materialId } });
    if (!rec || !ver) return { ok: false, code: "NOT_FOUND" };
    if (ver.fileId) {
      const f = await getStorage().stat(ver.fileId);
      if (!f) return { ok: false, code: "FILE_REQUIRED", field: "fileId" };
      if ((f.status ?? "READY") !== "READY") return { ok: false, code: "FILE_NOT_READY", field: "fileId" };
    }
    if (contentChanged(rec, ver)) await snapshotVersion(rec, actorId); // the state being replaced is kept
    await prisma.materialVersion.delete({ where: { id: versionId } });
    await prisma.material.update({ where: { id: materialId }, data: { kind: ver.kind, fileId: ver.fileId, fileMime: null, body: ver.body } });
    if (ver.fileId) await getStorage().markAttached(ver.fileId, true);
    return { ok: true, data: undefined };
  },
};
