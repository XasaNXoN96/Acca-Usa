/**
 * Server-side certificate PDF: structure, fonts (Latin / Cyrillic / Uzbek letters), long names, hostile characters.
 * Uses pdftotext (poppler) to read the generated file back.   npm run test:pdf
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { serverPdfProvider, type CertificatePdfLabels } from "../../src/services/certificates/pdf";
import type { IssuedCertificate } from "../../src/types";

const dir = mkdtempSync(join(tmpdir(), "cert-pdf-"));
const labels: CertificatePdfLabels = {
  brand: "ACCA USA", title: "Certificate of Completion", certifies: "This certifies that", completed: "has successfully completed the online course",
  issued: "Date of issue", number: "Certificate number", signature: "ACCA USA Learning Platform",
  disclaimer: "Issued by ACCA USA, an independent learning platform, to confirm completion of an online course. It is not an ACCA or other awarding-body qualification and grants no professional status.",
  verify: "Verify this certificate at", revoked: "Revoked",
};
const base: IssuedCertificate = {
  id: "c1", number: "AU-2026-000042", userId: "u1", studentName: "Demo Student", platform: "acca", subjectSlug: "bt", subjectCode: "BT",
  subjectName: "Business and Technology", title: "ACCA BT — Business and Technology", issuedAt: "2026-03-05T10:00:00.000Z", status: "issued", source: "auto",
};
const verifyUrl = "https://example.com/verify/certificate/AU-2026-000042";

const pdftotext = (bytes: Uint8Array, name: string, mode: "-layout" | "-raw" = "-layout") => {
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", [mode, file, "-"], { encoding: "utf8" });
};

async function main() {
  const latin = await serverPdfProvider.render({ cert: base, labels, verifyUrl, locale: "en" });
  assert.equal(Buffer.from(latin.subarray(0, 5)).toString(), "%PDF-");
  assert.ok(latin.byteLength > 2000 && latin.byteLength < 400_000, `size ${latin.byteLength}`);
  const text = pdftotext(latin, "latin.pdf");
  for (const needle of ["ACCA USA", "CERTIFICATE OF COMPLETION", "Demo Student", "BT — Business and Technology", "AU-2026-000042", "March 5, 2026", "not an ACCA or other awarding-body", verifyUrl]) {
    assert.ok(text.includes(needle), `latin PDF contains "${needle}"`);
  }

  const cyr = await serverPdfProvider.render({ cert: { ...base, studentName: "Дмитрий Соколов", subjectName: "Бизнес и технологии" }, labels: { ...labels, title: "Сертификат об окончании" }, verifyUrl, locale: "ru" });
  const cyrText = pdftotext(cyr, "cyr.pdf");
  assert.ok(cyrText.includes("Дмитрий Соколов") && cyrText.includes("Бизнес и технологии") && cyrText.includes("СЕРТИФИКАТ ОБ ОКОНЧАНИИ"), "Cyrillic renders");

  const uz = await serverPdfProvider.render({ cert: { ...base, studentName: "Ўктам Қодиров Ғ. Ҳамидов" }, labels, verifyUrl, locale: "uz" });
  assert.ok(pdftotext(uz, "uz.pdf").includes("Ўктам Қодиров Ғ. Ҳамидов"), "Uzbek letters render");

  const long = await serverPdfProvider.render({ cert: { ...base, studentName: "Alexandria Bartholomew Montgomery-Featherstonehaugh Wolfeschlegelsteinhausen", subjectName: "Strategic Business Leader and Enterprise Performance Management Advanced" }, labels, verifyUrl, locale: "en" });
  assert.ok(pdftotext(long, "long.pdf").includes("Wolfeschlegelsteinhausen"), "very long names still fit");

  const hostile = await serverPdfProvider.render({ cert: { ...base, studentName: "李雷 <script>alert(1)</script> 😀" }, labels, verifyUrl, locale: "en" });
  assert.equal(Buffer.from(hostile.subarray(0, 5)).toString(), "%PDF-", "characters outside the font never break generation");
  assert.ok(pdftotext(hostile, "hostile.pdf").includes("<script>alert(1)</script>"), "markup is plain text, never interpreted");

  const revoked = await serverPdfProvider.render({ cert: { ...base, status: "revoked" }, labels, verifyUrl, locale: "en" });
  assert.ok(pdftotext(revoked, "revoked.pdf", "-raw").includes("REVOKED"), "revoked watermark");

  const pages = execFileSync("pdfinfo", [join(dir, "latin.pdf")], { encoding: "utf8" });
  assert.match(pages, /Pages:\s+1/);
  assert.match(pages, /Page size:\s+841\.\d+ x 595\.\d+/, "A4 landscape");
  console.log("certificate-pdf: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
