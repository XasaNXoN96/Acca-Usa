import type { Locale } from "@/types";

/** Always format in UTC with an explicit locale so server and client render identical strings. */
export function formatDate(iso: string, locale: Locale | string, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC", ...opts }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: Locale | string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));
}

export function formatRelative(iso: string, locale: Locale | string, now: number = Date.now()) {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

export function formatMoney(cents: number, currency: string, locale: Locale | string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function formatNumber(n: number, locale: Locale | string) {
  return new Intl.NumberFormat(locale).format(n);
}

/** 1500 -> "25:00" ; 3725 -> "1:02:05" */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
