"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("states");
  const c = useTranslations("common");
  useEffect(() => {
    // Hook for the error-reporting service (Sentry etc.) in the backend block.
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="container-page grid min-h-dvh place-items-center py-16">
      <div className="w-full max-w-lg">
        <ErrorState title={t("errorTitle")} description={t("errorText")} action={<Button onClick={reset}>{c("retry")}</Button>} />
        {error.digest ? <p className="type-caption mt-3 text-center text-subtle-foreground">ID: {error.digest}</p> : null}
      </div>
    </main>
  );
}
