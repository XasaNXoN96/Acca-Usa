import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { StatsFilter } from "@/types";

export const rangePresets = ["7", "30", "90", "365"] as const;

/** Plain GET form (works without JavaScript, shareable URLs). */
export async function StatsFilters({
  filter, preset, platforms, subjects,
}: {
  filter: StatsFilter;
  preset: string;
  platforms: { value: string; label: string }[];
  subjects: { value: string; label: string; platform: string }[];
}) {
  const t = await getTranslations("admin.statistics.filters");
  return (
    <form method="get" role="search" aria-label={t("title")} data-stats-filters className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <div className="space-y-1.5">
        <label htmlFor="st-platform" className="type-caption font-semibold">{t("platform")}</label>
        <Select id="st-platform" name="platform" defaultValue={filter.platform ?? ""}>
          <option value="">{t("all")}</option>
          {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="st-subject" className="type-caption font-semibold">{t("subject")}</label>
        <Select id="st-subject" name="subject" defaultValue={filter.subjectSlug ?? ""}>
          <option value="">{t("all")}</option>
          {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="st-range" className="type-caption font-semibold">{t("range")}</label>
        <Select id="st-range" name="range" defaultValue={preset}>
          {rangePresets.map((r) => <option key={r} value={r}>{t(`days.${r}`)}</option>)}
          <option value="custom">{t("custom")}</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="st-from" className="type-caption font-semibold">{t("from")}</label>
        <Input id="st-from" name="from" type="date" defaultValue={filter.from} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="st-to" className="type-caption font-semibold">{t("to")}</label>
        <Input id="st-to" name="to" type="date" defaultValue={filter.to} />
      </div>
      <Button type="submit" className="w-full">{t("apply")}</Button>
    </form>
  );
}
