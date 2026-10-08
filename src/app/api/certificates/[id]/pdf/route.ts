import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/app-mode";
import { serverEnv } from "@/lib/env";
import { services } from "@/services";
import { serverPdfProvider } from "@/services/certificates/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/certificates/[id]/pdf — the owner (or an admin) downloads the certificate as a server-generated PDF.
 * Ownership is decided by the server from the session: the id in the URL is never trusted to name the owner.
 * Unknown ids and other people's certificates are both 404 (no existence oracle); revoked certificates are 410.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const text = async (status: number, ns: "states" | "certificates", key: string) =>
    new Response(await (await getTranslations(ns))(key as never), { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  const session = await getSession();
  if (!session) return text(401, "states", "fileUnauthorized");
  const { id } = await ctx.params;
  const cert = await services.certificates.getForUser(session.user.id, id, session.user.role === "ADMIN");
  if (!cert) return text(404, "states", "fileNotFound");
  if (cert.status !== "issued") return text(410, "certificates", "revokedNotice");

  const [locale, t] = await Promise.all([getLocale(), getTranslations("certificates")]);
  const origin = process.env.APP_URL ? serverEnv.appUrl() : new URL(req.url).origin;
  const pdf = await serverPdfProvider.render({
    cert,
    locale,
    verifyUrl: `${origin}/verify/certificate/${encodeURIComponent(cert.number)}`,
    labels: {
      brand: "ACCA USA",
      title: t("document.title"),
      certifies: t("document.certifies"),
      completed: t("document.completed"),
      issued: t("document.issued"),
      number: t("document.number"),
      signature: t("document.signature"),
      disclaimer: t("document.disclaimer"),
      verify: t("pdf.verify"),
      revoked: t("document.revoked"),
      demo: isDemoMode ? t("document.demo") : undefined,
    },
  });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cert.number}.pdf"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
