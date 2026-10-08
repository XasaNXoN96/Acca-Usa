export const locales = ["en", "ru", "uz"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeLabels: Record<AppLocale, { native: string; short: string }> = {
  en: { native: "English", short: "EN" },
  ru: { native: "Русский", short: "RU" },
  uz: { native: "O‘zbekcha", short: "UZ" },
};

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(header: string | null | undefined): AppLocale {
  if (!header) return defaultLocale;
  const wanted = header
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase().split("-")[0])
    .filter(Boolean);
  for (const w of wanted) if (isLocale(w)) return w;
  return defaultLocale;
}
