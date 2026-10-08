"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** Shared body for route-level error boundaries (keeps the surrounding shell visible). */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("states");
  const c = useTranslations("common");
  useEffect(() => {
    // Hook for the error-reporting service in the backend block.
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto w-full max-w-xl py-10">
      <ErrorState title={t("errorTitle")} description={t("errorText")} action={<Button onClick={reset}>{c("retry")}</Button>} />
      {error.digest ? <p className="type-caption mt-3 text-center text-subtle-foreground">ID: {error.digest}</p> : null}
    </div>
  );
}
