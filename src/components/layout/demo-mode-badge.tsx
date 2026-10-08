import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/app-mode";

/** Visible whenever NEXT_PUBLIC_APP_MODE=demo, so demo data is never mistaken for production. */
export async function DemoModeBadge({ className }: { className?: string }) {
  if (!isDemoMode) return null;
  const t = await getTranslations("common");
  return (
    <Badge variant="warning" className={className}>
      <FlaskConical aria-hidden />
      {t("demoMode")}
    </Badge>
  );
}
