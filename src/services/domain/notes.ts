export const NOTE_MAX_CHARS = 2000;
export const NOTES_PER_USER = 2000;

/** Shared validation of a note (used by both providers; the server action validates the raw request with zod first). */
export function checkNote(input: { body: string; pdfPage?: number; videoSeconds?: number }): "BODY" | "ANCHOR" | null {
  const body = input.body.trim();
  if (!body || body.length > NOTE_MAX_CHARS) return "BODY";
  const hasPage = input.pdfPage !== undefined;
  const hasTime = input.videoSeconds !== undefined;
  if (hasPage && hasTime) return "ANCHOR";
  if (hasPage && !(Number.isInteger(input.pdfPage) && input.pdfPage! >= 1 && input.pdfPage! <= 10_000)) return "ANCHOR";
  if (hasTime && !(Number.isInteger(input.videoSeconds) && input.videoSeconds! >= 0 && input.videoSeconds! <= 24 * 3600)) return "ANCHOR";
  return null;
}
