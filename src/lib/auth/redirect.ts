/** Only same-site relative paths are accepted as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/^\/(login|register|forgot-password|reset-password)(\/|$|\?)/.test(next)) return null;
  return next.slice(0, 300);
}
