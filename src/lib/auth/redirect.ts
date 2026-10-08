/** Only same-site relative paths are accepted as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  // Browsers drop tabs / newlines and treat "\\" like "/" inside URLs, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  if (/^\/(login|register|forgot-password|reset-password)(\/|$|\?)/.test(next)) return null;
  return next.slice(0, 300);
}
