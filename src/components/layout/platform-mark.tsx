import { cn } from "@/lib/utils";
import { platformTheme } from "@/lib/platform-theme";
import type { PlatformSlug } from "@/types";

const sizes = { sm: "size-8 text-[0.6rem]", md: "size-11 text-xs", lg: "size-14 text-sm" } as const;

/** Neutral lettermark tile in the platform colour (not the awarding body's logo). */
export function PlatformMark({ platform, size = "md", className }: { platform: PlatformSlug; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-lg font-extrabold uppercase tracking-tight",
        platformTheme[platform].solid,
        platformTheme[platform].onSolid,
        sizes[size],
        className,
      )}
    >
      {platform}
    </span>
  );
}
