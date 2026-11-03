import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, seoIndexing } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!seoIndexing()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }, ...(base ? { sitemap: `${base}/sitemap.xml` } : {}) };
}
