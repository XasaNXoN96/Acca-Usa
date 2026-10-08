import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export async function CtaSection() {
  const t = await getTranslations("landing.cta");
  return (
    <section aria-labelledby="cta-title" className="py-14 sm:py-20">
      <div className="container-page">
        <div className="rounded-3xl bg-surface-navy px-6 py-12 text-center text-white sm:px-12">
          <h2 id="cta-title" className="type-h2 text-balance">
            {t("title")}
          </h2>
          <p className="type-body mx-auto mt-3 max-w-xl text-white/80">{t("text")}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={routes.register}>{t("primary")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
              <Link href={routes.login}>{t("secondary")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
