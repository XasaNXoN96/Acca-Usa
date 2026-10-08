import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        navy: "bg-navy text-navy-foreground shadow-xs hover:bg-navy/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-navy-soft/70",
        outline: "border border-input bg-background text-foreground hover:bg-muted",
        "outline-primary": "border border-primary bg-background text-primary hover:bg-primary-soft",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        link: "h-auto rounded-sm p-0 text-primary underline-offset-4 hover:underline",
        cima: "bg-cima text-cima-foreground shadow-xs hover:bg-cima/90",
        fia: "bg-fia text-fia-foreground shadow-xs hover:bg-fia/90",
      },
      size: {
        sm: "h-9 px-3",
        default: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-10 pointer-coarse:min-w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
