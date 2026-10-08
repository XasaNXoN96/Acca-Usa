import "server-only";
import { routes } from "@/lib/routes";
import type { IssuedCertificate, Locale } from "@/types";
import { absoluteUrl, sendEmail } from "./index";

/** "Your certificate is ready" — called by both data providers after a certificate is created. */
export async function emailCertificateIssued(user: { name: string; email: string; locale: Locale }, cert: IssuedCertificate) {
  await sendEmail(
    { email: user.email, locale: user.locale },
    {
      kind: "certificateIssued", name: user.name, certificateTitle: cert.title, number: cert.number,
      certificateUrl: absoluteUrl(routes.certificate(cert.id)), verifyUrl: absoluteUrl(`/verify/certificate/${cert.number}`),
    },
  );
}
