import type { PlatformSlug } from "@/types";

/**
 * One place that maps a platform to its colour tokens.
 * ACCA = red, FIA = green — used consistently in cards, badges, progress and CTAs.
 * Literal class names are required so Tailwind can see them.
 */
export const platformTheme = {
  acca: {
    text: "text-acca",
    soft: "bg-acca-soft",
    solid: "bg-acca",
    onSolid: "text-acca-foreground",
    border: "border-acca/30",
    badge: "acca",
    tone: "acca",
    button: "default",
    outlineButton: "outline-primary",
    gradient: "from-acca-soft via-background to-background",
  },
  fia: {
    text: "text-fia",
    soft: "bg-fia-soft",
    solid: "bg-fia",
    onSolid: "text-fia-foreground",
    border: "border-fia/30",
    badge: "fia",
    tone: "fia",
    button: "fia",
    outlineButton: "outline",
    gradient: "from-fia-soft via-background to-background",
  },
} as const satisfies Record<PlatformSlug, Record<string, string>>;

export const platformOrder: PlatformSlug[] = ["acca", "fia"];

export function isPlatformSlug(value: string): value is PlatformSlug {
  return value === "acca" || value === "fia";
}
