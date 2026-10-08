import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

/** Marks any figure or content that is placeholder data, not real production data. */
export function DemoBadge({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <Badge variant="warning" className={className}>
      <FlaskConical aria-hidden />
      {t("demoData")}
    </Badge>
  );
}
