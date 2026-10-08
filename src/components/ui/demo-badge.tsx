import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/app-mode";

/** Marks placeholder content in DEMO mode only; renders nothing in production. */
export function DemoBadge({ className }: { className?: string }) {
  const t = useTranslations("common");
  if (!isDemoMode) return null; // production never labels real data as demo data
  return (
    <Badge variant="warning" className={className}>
      <FlaskConical aria-hidden />
      {t("demoData")}
    </Badge>
  );
}
