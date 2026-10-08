import Link from "next/link";
import { BookOpen, ClipboardList, FolderOpen, LayoutGrid, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const subjectTabs = ["overview", "topics", "tests", "materials", "progress"] as const;
export type SubjectTab = (typeof subjectTabs)[number];

const icons = { overview: LayoutGrid, topics: BookOpen, tests: ClipboardList, materials: FolderOpen, progress: TrendingUp } as const;

/** URL-driven section nav: vertical sidebar on lg, horizontally scrollable pills below. */
export async function SubjectNav({ slug, active }: { slug: string; active: SubjectTab }) {
  const t = await getTranslations("subject");
  return (
    <nav aria-label={t("nav")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-1 lg:flex-col">
        {subjectTabs.map((tab) => {
          const Icon = icons[tab];
          const isActive = tab === active;
          return (
            <li key={tab} className="shrink-0">
              <Link
                href={routes.subjectTab(slug, tab)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-3.5 text-sm font-semibold transition-colors lg:w-full",
                  isActive ? "bg-navy text-navy-foreground" : "bg-card text-foreground/85 ring-1 ring-border hover:bg-muted lg:bg-transparent lg:ring-0",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(`tabs.${tab}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
