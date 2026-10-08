import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

/** Plain GET form: shareable URLs, works without JavaScript. Subjects are listed with their platform so a subject choice is unambiguous. */
export async function RankingFilters({
  platform, subject, platforms, subjects,
}: {
  platform?: string; subject?: string;
  platforms: { value: string; label: string }[];
  subjects: { value: string; label: string }[];
}) {
  const t = await getTranslations("ranking.filters");
  return (
    <form method="get" role="search" aria-label={t("title")} data-ranking-filters className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 sm:items-end">
      <div className="space-y-1.5">
        <label htmlFor="rk-platform" className="type-caption font-semibold">{t("platform")}</label>
        <Select id="rk-platform" name="platform" defaultValue={platform ?? ""}>
          <option value="">{t("all")}</option>
          {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rk-subject" className="type-caption font-semibold">{t("subject")}</label>
        <Select id="rk-subject" name="subject" defaultValue={subject ?? ""}>
          <option value="">{t("all")}</option>
          {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <Button type="submit" className="w-full">{t("apply")}</Button>
    </form>
  );
}
