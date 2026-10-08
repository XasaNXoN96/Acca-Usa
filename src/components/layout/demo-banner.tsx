import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Visible at all times in preview shells so nobody mistakes the demo for a secured, real system. */
export async function DemoBanner({ message }: { message?: string }) {
  const t = await getTranslations("common");
  return (
    <div role="note" className="flex items-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-1.5 text-warning">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <p className="type-caption font-medium">{message ?? t("demoNotice")}</p>
    </div>
  );
}
