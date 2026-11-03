/**
 * Search-engine visibility. The site ships NOT indexed (staging, demo, a server nobody should find yet).
 * SEO_INDEX=1 on the production server lets search engines index the public pages (robots.txt + sitemap.xml + meta robots).
 * Student and admin areas, APIs and anything personal are never listed either way.
 */
export const seoIndexing = (): boolean => process.env.SEO_INDEX === "1";

export const PRIVATE_PATHS = ["/admin", "/api", "/dashboard", "/courses", "/platform", "/topic", "/test", "/exams", "/progress", "/ranking", "/notes", "/mistakes", "/certificates", "/payments", "/notifications", "/profile", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/consent"];
