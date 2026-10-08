import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { routes } from "@/lib/routes";

export default async function NotFound() {
  const t = await getTranslations("states");
  return (
    <main id="main" className="container-page grid min-h-dvh place-items-center py-16">
      <div className="w-full max-w-lg">
        <p className="type-eyebrow mb-3 text-center text-primary">404</p>
        <EmptyState
          title={t("notFoundTitle")}
          description={t("notFoundText")}
          action={
            <>
              <Button asChild>
                <Link href={routes.home}>{t("goHome")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={routes.dashboard}>{t("goDashboard")}</Link>
              </Button>
            </>
          }
        />
      </div>
    </main>
  );
}
