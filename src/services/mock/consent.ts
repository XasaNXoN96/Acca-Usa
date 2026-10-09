import "server-only";
import type { ConsentService } from "../contracts";
import { LEGAL_VERSIONS, snapshotOf } from "@/lib/legal/consent";
import { getDb, nowIso } from "./db";

export const consentService: ConsentService = {
  async current(userId) {
    return snapshotOf(getDb().consents.filter((c) => c.userId === userId));
  },
  async record(userId, entries, meta) {
    const db = getDb();
    for (const e of entries) db.consents.push({ userId, kind: e.kind, version: LEGAL_VERSIONS[e.kind], granted: e.granted, locale: meta.locale, source: meta.source, at: nowIso() });
  },
  async history(userId) {
    return getDb().consents.filter((c) => c.userId === userId).map(({ kind, version, granted, locale, source, at }) => ({ kind, version, granted, locale, source, at })).reverse();
  },
};
