import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/ui/states";

export default async function Loading() {
  const t = await getTranslations("states");
  return <PageSkeleton label={t("loading")} />;
}
