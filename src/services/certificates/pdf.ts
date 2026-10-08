import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { IssuedCertificate } from "@/types";

/** Translated strings the PDF needs (the caller resolves them in the learner's language). */
export interface CertificatePdfLabels {
  brand: string;
  title: string;
  certifies: string;
  completed: string;
  issued: string;
  number: string;
  signature: string;
  disclaimer: string;
  verify: string;
  revoked: string;
  /** Extra line shown only in the demo build ("Demo build — sample certificate."). */
  demo?: string;
}

export interface CertificatePdfInput {
  cert: IssuedCertificate;
  labels: CertificatePdfLabels;
  /** Absolute public verification URL, encoded into the QR code and printed under it. */
  verifyUrl: string;
  /** BCP-47 tag used to format the issue date. */
  locale: string;
}

export interface CertificatePdfProvider {
  readonly name: string;
  /** Returns the PDF bytes. */
  render(input: CertificatePdfInput): Promise<Uint8Array>;
}

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");
const fontBytes = new Map<string, Promise<Buffer>>();
const loadFont = (file: string) => {
  let p = fontBytes.get(file);
  if (!p) fontBytes.set(file, (p = readFile(join(FONT_DIR, file))));
  return p;
};

const NAVY = rgb(0.059, 0.114, 0.227);
const MUTED = rgb(0.294, 0.353, 0.471);
const LINE = rgb(0.847, 0.871, 0.918);
const ACCENT = rgb(0.784, 0.063, 0.18);

/** Drops characters the embedded font cannot draw (pdf-lib throws on them) — a name must never break the download. */
function printable(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text.normalize("NFC")].map((ch) => (ch === "\n" || ch === "\t" ? " " : set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = printable(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function centered(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color = NAVY) {
  const safe = printable(font, text);
  page.drawText(safe, { x: (page.getWidth() - font.widthOfTextAtSize(safe, size)) / 2, y, size, font, color });
}

/** Shrinks a single line until it fits `maxWidth` (long names), never below `min`. */
function fit(font: PDFFont, text: string, size: number, maxWidth: number, min = 14): number {
  let s = size;
  const safe = printable(font, text);
  while (s > min && font.widthOfTextAtSize(safe, s) > maxWidth) s -= 1;
  return s;
}

function drawQr(page: PDFPage, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) page.drawRectangle({ x: x + c * cell, y: y + (n - 1 - r) * cell, width: cell + 0.2, height: cell + 0.2, color: rgb(0, 0, 0) });
    }
  }
}

/**
 * Server-side certificate PDF (A4 landscape, ACCA USA style). Pure function of its input: the same certificate always
 * yields the same layout. DejaVu fonts (embedded, subsetted) cover Latin, Cyrillic and the Uzbek letters. The document
 * carries the same wording as the on-screen certificate — including the statement that it is NOT an ACCA/FIA qualification.
 */
export const serverPdfProvider: CertificatePdfProvider = {
  name: "server-pdf-lib",
  async render({ cert, labels, verifyUrl, locale }) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(`${labels.title} ${cert.number}`);
    pdf.setAuthor(labels.brand);
    pdf.setSubject(`${cert.subjectCode} — ${cert.subjectName}`);
    pdf.setProducer(labels.brand);
    pdf.setCreationDate(new Date(cert.issuedAt));

    const [sans, bold, serifBold] = await Promise.all([
      pdf.embedFont(await loadFont("DejaVuSans.ttf"), { subset: true }),
      pdf.embedFont(await loadFont("DejaVuSans-Bold.ttf"), { subset: true }),
      pdf.embedFont(await loadFont("DejaVuSerif-Bold.ttf"), { subset: true }),
    ]);
    const mono = await pdf.embedFont(StandardFonts.CourierBold);

    const page = pdf.addPage([841.89, 595.28]);
    const W = page.getWidth();
    const H = page.getHeight();
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: NAVY, borderWidth: 2.5 });
    page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: LINE, borderWidth: 1, borderDashArray: [4, 3] });

    // brand
    const accaW = bold.widthOfTextAtSize("ACCA ", 22);
    const usaW = bold.widthOfTextAtSize("USA", 22);
    const bx = (W - accaW - usaW) / 2;
    page.drawText("ACCA ", { x: bx, y: H - 84, size: 22, font: bold, color: NAVY });
    page.drawText("USA", { x: bx + accaW, y: H - 84, size: 22, font: bold, color: ACCENT });

    centered(page, bold, labels.title.toUpperCase(), H - 118, 13, MUTED);
    centered(page, sans, labels.certifies, H - 152, 12, MUTED);

    const nameSize = fit(serifBold, cert.studentName, 38, W - 140);
    centered(page, serifBold, cert.studentName, H - 200, nameSize);
    page.drawLine({ start: { x: 220, y: H - 212 }, end: { x: W - 220, y: H - 212 }, thickness: 0.8, color: LINE });

    centered(page, sans, labels.completed, H - 244, 12, MUTED);
    const course = `${cert.subjectCode} — ${cert.subjectName}`;
    const courseLines = wrap(bold, course, 22, W - 160).slice(0, 2);
    courseLines.forEach((line, i) => centered(page, bold, line, H - 278 - i * 28, 22));
    const platformY = H - 278 - courseLines.length * 28 - 2;
    centered(page, bold, cert.platform.toUpperCase(), platformY, 12, MUTED);

    // footer row: date | QR | number
    const rowY = 118;
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(cert.issuedAt));
    page.drawText(printable(sans, labels.issued.toUpperCase()), { x: 70, y: rowY + 46, size: 8.5, font: bold, color: MUTED });
    page.drawText(printable(bold, date), { x: 70, y: rowY + 28, size: 13, font: bold, color: NAVY });

    const numLabel = printable(sans, labels.number.toUpperCase());
    page.drawText(numLabel, { x: W - 70 - bold.widthOfTextAtSize(numLabel, 8.5), y: rowY + 46, size: 8.5, font: bold, color: MUTED });
    page.drawText(cert.number, { x: W - 70 - mono.widthOfTextAtSize(cert.number, 14), y: rowY + 28, size: 14, font: mono, color: NAVY });

    drawQr(page, verifyUrl, W / 2 - 34, rowY - 4, 68);
    centered(page, sans, labels.verify, rowY - 18, 8, MUTED);
    centered(page, sans, verifyUrl, rowY - 29, 7.5, MUTED);

    // signature + disclaimer
    page.drawLine({ start: { x: 70, y: 70 }, end: { x: W - 70, y: 70 }, thickness: 0.6, color: LINE });
    const small = [labels.signature, ...wrap(sans, labels.disclaimer, 8, W - 160), ...(labels.demo ? [labels.demo] : [])];
    small.slice(0, 5).forEach((line, i) => centered(page, i === 0 ? bold : sans, line, 58 - i * 10, 8, MUTED));

    if (cert.status === "revoked") {
      const text = printable(bold, labels.revoked.toUpperCase());
      page.drawText(text, { x: W / 2 - 150, y: H / 2 - 40, size: 64, font: bold, color: ACCENT, opacity: 0.45, rotate: degrees(14) });
    }
    return pdf.save();
  },
};
