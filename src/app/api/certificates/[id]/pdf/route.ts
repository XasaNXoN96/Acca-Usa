import { getSession } from "@/lib/auth/session";
import { services } from "@/services";
import { demoPdfProvider } from "@/services/certificates/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed-in owner (or admin) only. 501 in the demo build: PDFs are produced with the browser's print dialog. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const cert = await services.certificates.getForUser(session.user.id, id, session.user.role === "ADMIN");
  if (!cert) return new Response("Not found", { status: 404 });
  if (cert.status !== "issued") return new Response("Gone", { status: 410 });
  const pdf = await demoPdfProvider.render(cert);
  if (!pdf) return Response.json({ error: "PDF generation is not enabled in the demo build. Use Print / Save as PDF." }, { status: 501 });
  return new Response(pdf as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cert.number}.pdf"`, "X-Content-Type-Options": "nosniff" } });
}
