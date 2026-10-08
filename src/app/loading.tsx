import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/ui/states";

export default async function Loading() {
  const t = await getTranslations("states");
  return (
    <div className="container-page py-10">
      <PageSkeleton label={t("loading")} />
    </div>
  );
}
