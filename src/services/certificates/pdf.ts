import type { IssuedCertificate } from "@/types";

/**
 * Seam for server-side PDF generation (not enabled in the demo build).
 *
 * Today a certificate is an HTML document (`CertificateDocument`) that students print or "Save as PDF" from the
 * browser. A production provider will implement this interface (e.g. headless Chromium rendering of the same page, or a
 * PDF library), store the file through `StorageProvider` and be wired in `services/index.ts`.
 * `/api/certificates/[id]/pdf` already performs the session + ownership checks and calls the provider, so enabling
 * PDF output later does not change any URL or permission rule.
 */
export interface CertificatePdfProvider {
  readonly name: string;
  /** Returns the PDF bytes, or null when this provider cannot render (the route then answers 501). */
  render(cert: IssuedCertificate): Promise<Uint8Array | null>;
}

/** Demo provider: no server-side rendering — use the browser's print dialog. */
export const demoPdfProvider: CertificatePdfProvider = {
  name: "demo-print-only",
  async render() {
    return null;
  },
};
