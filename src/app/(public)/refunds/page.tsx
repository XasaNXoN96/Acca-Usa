import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { refunds as docs } from "@/content/legal/refunds";
import { LegalDocument } from "@/features/legal/legal-document";
import { isLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: docs[isLocale(locale) ? locale : "en"].title };
}

export default function Page() {
  return <LegalDocument docs={docs} kind="info" />;
}
