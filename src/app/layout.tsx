import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
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
  themeColor: "#0b1f3a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, t] = await Promise.all([getLocale(), getMessages(), getTranslations("common")]);
  return (
    <html lang={locale}>
      <body>
        <a
          href="#main"
          className="sr-only z-[100] rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
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
