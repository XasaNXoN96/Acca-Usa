import type { MetadataRoute } from "next";
import { seoIndexing } from "@/lib/seo";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** Public pages only (platform pages, subject pages, books, legal texts). Empty unless SEO_INDEX=1. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!seoIndexing() || !base) return [];
  const subjects = (await services.subjects.listAll()).filter((s) => !s.archived);
  const fixed = ["/", "/all-courses", "/acca", "/fia", "/books", "/terms", "/privacy", "/cookies", "/refunds"];
  return [...fixed.map((p) => ({ url: `${base}${p}` })), ...subjects.map((s) => ({ url: `${base}/subject/${encodeURIComponent(s.slug)}` }))];
}
