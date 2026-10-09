import "server-only";
import type { ConsentService } from "../contracts";
import { LEGAL_VERSIONS, snapshotOf } from "@/lib/legal/consent";
import { getPrisma } from "@/lib/prisma";

export const consentService: ConsentService = {
  async current(userId) {
    const rows = await getPrisma().consentRecord.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return snapshotOf(rows.map((r) => ({ kind: r.kind, version: r.version, granted: r.granted, at: r.createdAt.toISOString() })));
  },
  async record(userId, entries, meta) {
    if (!entries.length) return;
    // one timestamp per call keeps the order of the entries; createdAt differs from earlier calls
    await getPrisma().consentRecord.createMany({ data: entries.map((e) => ({ userId, kind: e.kind, version: LEGAL_VERSIONS[e.kind], granted: e.granted, locale: meta.locale, source: meta.source })) });
  },
  async history(userId) {
    const rows = await getPrisma().consentRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => ({ kind: r.kind, version: r.version, granted: r.granted, locale: r.locale, source: r.source, at: r.createdAt.toISOString() }));
  },
};
