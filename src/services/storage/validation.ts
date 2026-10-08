/**
 * Upload validation. Never trust the browser: the declared MIME type is ignored,
 * the extension must be on the allow-list for the requested kind, the size is capped,
 * and the leading bytes must match the file family ("magic bytes").
 * SVG and HTML are deliberately NOT allowed (script carriers).
 */
export const uploadKinds = ["image", "pdf", "slides", "audio", "video", "file"] as const;
export type UploadKind = (typeof uploadKinds)[number];

type Family = "jpeg" | "png" | "webp" | "pdf" | "mp3" | "wav" | "ogg" | "mp4" | "webm" | "zip" | "text";

const MB = 1024 * 1024;

interface Rule {
  exts: string[];
  maxBytes: number;
}

export const uploadRules: Record<UploadKind, Rule> = {
  image: { exts: ["jpg", "jpeg", "png", "webp"], maxBytes: 5 * MB },
  pdf: { exts: ["pdf"], maxBytes: 25 * MB },
  slides: { exts: ["pdf", "pptx"], maxBytes: 40 * MB },
  audio: { exts: ["mp3", "wav", "m4a", "ogg"], maxBytes: 40 * MB },
  video: { exts: ["mp4", "webm"], maxBytes: 150 * MB },
  file: { exts: ["pdf", "txt", "csv", "docx", "xlsx", "pptx", "zip"], maxBytes: 25 * MB },
};

const extFamily: Record<string, Family> = {
  jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp", pdf: "pdf", mp3: "mp3", wav: "wav", m4a: "mp4",
  ogg: "ogg", mp4: "mp4", webm: "webm", docx: "zip", xlsx: "zip", pptx: "zip", zip: "zip", txt: "text", csv: "text",
};

/** Mime type is derived from the (validated) extension, never from the client. */
export const extMime: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Types the browser may render inline; everything else is forced to download. */
export const inlineMimes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "video/mp4", "video/webm"]);

export type UploadError = "EMPTY" | "NAME" | "TYPE" | "SIZE" | "SIGNATURE";
export type UploadCheck = { ok: true; ext: string; mime: string; safeName: string } | { ok: false; code: UploadError };

function sniff(b: Uint8Array): Family | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 5) === "%PDF-") return "pdf";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return "mp3";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(4, 8) === "ftyp") return "mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return "zip";
  if (!b.slice(0, 512).includes(0)) return "text"; // no NUL bytes → plain text
  return null;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // keep letters/digits/space/dot/dash/underscore (unicode letters allowed), drop control chars
  const cleaned = base.normalize("NFKC").replace(/[^\p{L}\p{N} ._()-]/gu, "").replace(/\.{2,}/g, ".").trim();
  return cleaned.slice(0, 120) || "file";
}

export async function validateUpload(kind: UploadKind, file: File): Promise<UploadCheck> {
  if (!file || file.size === 0) return { ok: false, code: "EMPTY" };
  const safeName = sanitizeFileName(file.name);
  const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
  const rule = uploadRules[kind];
  if (!ext || !rule.exts.includes(ext)) return { ok: false, code: "TYPE" };
  if (file.size > rule.maxBytes) return { ok: false, code: "SIZE" };
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (sniff(head) !== extFamily[ext]) return { ok: false, code: "SIGNATURE" };
  return { ok: true, ext, mime: extMime[ext] ?? "application/octet-stream", safeName };
}

/** Which upload rule a material kind uses. */
export function uploadKindFor(materialKind: string): UploadKind | null {
  switch (materialKind) {
    case "video": return "video";
    case "audio": return "audio";
    case "pdf":
    case "book": return "pdf";
    case "slides": return "slides";
    case "image": return "image";
    case "file": return "file";
    default: return null;
  }
}
