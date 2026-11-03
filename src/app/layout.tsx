import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { seoIndexing } from "@/lib/seo";
import { isTheme, themeInitScript, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(process.env.AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
    applicationName: "ACCA USA",
    openGraph: { title: t("title"), description: t("description"), siteName: "ACCA USA", type: "website" },
    robots: seoIndexing() ? { index: true, follow: true } : { index: false, follow: false }, // SEO_INDEX=1 on the production server (docs/VPS_DEPLOYMENT.md)
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1322" },
  ],
};

/** Browsers get everything except the (large, admin-only) `admin` texts; the admin layout adds them back. Keeps every public / student page lighter. */
function clientMessages(all: Record<string, unknown>): Record<string, unknown> {
  const { admin, ...rest } = all as { admin?: Record<string, unknown> } & Record<string, unknown>;
  return { ...rest, admin: { roles: admin?.roles, userStatus: admin?.userStatus } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, t, jar] = await Promise.all([getLocale(), getMessages(), getTranslations("common"), cookies()]);
  const stored = jar.get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : "system";
  return (
    // suppressHydrationWarning: the blocking script below may add the `dark` class for "system" before hydration.
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only z-[100] rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-navy-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={clientMessages(messages)}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
