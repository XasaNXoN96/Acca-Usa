import type { MaterialKind, MaterialStats, MaterialStatsRow, PlatformSlug, StatsFilter } from "@/types";

/**
 * Pure aggregation for the material analytics page. Both providers load the RAW records (views, completions, submitted
 * attempts, files) and call this, so the in-memory and PostgreSQL numbers cannot drift apart. Nothing is estimated:
 * no events in the range → zeros / nulls.
 */
export interface MaterialStatsInput {
  filter: StatsFilter;
  materials: {
    id: string; title: string; kind: MaterialKind; subjectSlug: string; subjectCode: string; platform: PlatformSlug; topicId?: string; topicTitle?: string;
    published: boolean; publishAt?: string; archived: boolean; fileStatus?: MaterialStatsRow["fileStatus"]; errorCode?: string;
  }[];
  views: { materialId: string; userId: string; at: string }[];
  completions: { materialId: string; userId: string; at: string }[];
  attempts: { topicId?: string; scorePercent: number; at: string }[];
  now?: number;
}

const startOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();
const endOf = (iso: string) => new Date(`${iso}T23:59:59.999Z`).getTime();

export function buildMaterialStats(input: MaterialStatsInput): MaterialStats {
  const { filter } = input;
  const from = startOf(filter.from);
  const to = endOf(filter.to);
  const now = input.now ?? Date.now();
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= from && t <= to; };

  const rows: MaterialStatsRow[] = input.materials
    .filter((m) => !m.archived && (!filter.subjectSlug || m.subjectSlug === filter.subjectSlug) && (!filter.platform || m.platform === filter.platform))
    .map((m) => {
      const views = input.views.filter((v) => v.materialId === m.id && inRange(v.at));
      const viewers = new Set(views.map((v) => v.userId));
      const done = new Set(input.completions.filter((c) => c.materialId === m.id && inRange(c.at)).map((c) => c.userId));
      const attempts = m.topicId ? input.attempts.filter((a) => a.topicId === m.topicId && inRange(a.at)) : [];
      const visibility = !m.published ? "draft" : m.publishAt && new Date(m.publishAt).getTime() > now ? "scheduled" : "published";
      return {
        materialId: m.id, title: m.title, kind: m.kind, subjectCode: m.subjectCode, topicTitle: m.topicTitle, visibility,
        views: views.length, uniqueViewers: viewers.size, completions: done.size,
        completionRate: viewers.size ? Math.min(100, Math.round((done.size / viewers.size) * 100)) : null,
        fileStatus: m.fileStatus, errorCode: m.errorCode,
        topicTestAttempts: attempts.length,
        topicTestAvgScore: attempts.length ? Math.round(attempts.reduce((s, a) => s + a.scorePercent, 0) / attempts.length) : null,
      } satisfies MaterialStatsRow;
    })
    .sort((a, b) => b.views - a.views || b.completions - a.completions || a.title.localeCompare(b.title));

  const ids = new Set(rows.map((r) => r.materialId));
  const rangeViews = input.views.filter((v) => ids.has(v.materialId) && inRange(v.at));
  return {
    filter,
    totals: {
      materials: rows.length,
      views: rows.reduce((s, r) => s + r.views, 0),
      uniqueViewers: new Set(rangeViews.map((v) => v.userId)).size,
      completions: rows.reduce((s, r) => s + r.completions, 0),
      processingErrors: rows.filter((r) => r.fileStatus === "FAILED" || r.fileStatus === "REJECTED").length,
    },
    rows,
  };
}
