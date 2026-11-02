import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, defaultLocale, isLocale, negotiateLocale, type AppLocale } from "./config";

/**
 * Locale is resolved per request (cookie → Accept-Language → default) so the public
 * URLs stay clean (/acca, /dashboard) as required. Messages always fall back to English
 * for any missing key instead of rendering raw keys.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = isLocale(fromCookie) ? fromCookie : negotiateLocale((await headers()).get("accept-language"));

  return { locale, messages: await messagesFor(locale) };
});

/** The merged dictionary of a locale never changes while the process runs: build it once, not on every request. */
const merged = new Map<AppLocale, Dict>();
async function messagesFor(locale: AppLocale): Promise<Dict> {
  const hit = merged.get(locale);
  if (hit) return hit;
  const own = (await import(`./messages/${locale}.json`)).default as Dict;
  let result = own;
  if (locale !== defaultLocale) {
    const fallback = (await import(`./messages/${defaultLocale}.json`)).default as Dict;
    result = deepMerge(fallback, own);
  }
  merged.set(locale, result);
  return result;
}

type Dict = { [key: string]: string | Dict };
function deepMerge(base: Dict, override: Dict): Dict {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const b = out[k];
    out[k] = typeof v === "object" && v !== null && typeof b === "object" && b !== null ? deepMerge(b, v) : v;
  }
  return out;
}
