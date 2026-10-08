import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { isTheme, themeInitScript, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
    applicationName: "ACCA USA",
    openGraph: { title: t("title"), description: t("description"), siteName: "ACCA USA", type: "website" },
    robots: { index: false, follow: false }, // flip when the product goes live
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
