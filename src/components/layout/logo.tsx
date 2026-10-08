import Link from "next/link";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

/** ACCA USA wordmark. `tone="inverse"` is for dark (navy) backgrounds. */
export function Logo({
  tone = "default",
  className,
  href = routes.home,
  stacked = false,
}: {
  tone?: "default" | "inverse";
  className?: string;
  href?: string;
  /** Two-line mark for narrow containers such as the tablet icon rail. */
  stacked?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="ACCA USA"
      className={cn(
        "rounded-md font-extrabold tracking-tight",
        stacked ? "inline-flex flex-col items-center text-sm leading-none" : "inline-flex items-baseline gap-1.5 text-xl",
        className,
      )}
    >
      <span className={tone === "inverse" ? "text-white" : "text-navy"}>ACCA</span>
      <span className={tone === "inverse" ? "text-white" : "text-primary"}>USA</span>
    </Link>
  );
}
