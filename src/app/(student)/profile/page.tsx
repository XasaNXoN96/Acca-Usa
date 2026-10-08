import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileForm } from "@/features/profile/profile-form";
import { isLocale } from "@/i18n/config";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("profilePage"))("title") };
}

export default async function ProfilePage() {
  const session = await services.auth.getSession("STUDENT");
  const [t, locale] = await Promise.all([getTranslations("profilePage"), getLocale()]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ProfileForm defaults={{ name: session.user.name, email: session.user.email, language: isLocale(locale) ? locale : "en" }} />
    </>
  );
}
