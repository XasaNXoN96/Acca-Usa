import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-xl border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-info/25 bg-info-soft text-foreground [&_svg]:text-info",
      success: "border-success/25 bg-success-soft text-foreground [&_svg]:text-success",
      warning: "border-warning/30 bg-warning-soft text-foreground [&_svg]:text-warning",
      destructive: "border-destructive/25 bg-destructive-soft text-foreground [&_svg]:text-destructive",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, destructive: AlertCircle } as const;

export function Alert({
  className,
  variant = "info",
  title,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & VariantProps<typeof alertVariants> & { title?: string }) {
  const Icon = icons[variant ?? "info"];
  return (
    <div role={variant === "destructive" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
