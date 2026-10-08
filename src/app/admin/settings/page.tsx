import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { ErrorState } from "@/components/ui/states";
import { SettingsForm } from "@/features/admin/settings-form";
import { can } from "@/lib/permissions";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.settings"))("title") };
}

export default async function SettingsPage() {
  const [t, s, session] = await Promise.all([getTranslations("admin.settings"), getTranslations("states"), requireSession(STAFF_ROLES)]);
  if (!can(session.user.role, "manage_settings")) {
    return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      <SettingsForm />
    </>
  );
}
