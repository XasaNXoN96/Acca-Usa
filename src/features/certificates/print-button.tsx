"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog (which also offers "Save as PDF"). Only the certificate is printed — see globals.css. */
export function PrintCertificateButton() {
  const t = useTranslations("certificates");
  return (
    <Button onClick={() => window.print()} className="no-print">
      <Printer aria-hidden />
      {t("print")}
    </Button>
  );
}
