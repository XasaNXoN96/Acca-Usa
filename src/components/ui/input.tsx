import * as React from "react";
import { cn } from "@/lib/utils";

export const controlClass =
  "w-full rounded-lg border border-input bg-background px-3 text-base text-foreground placeholder:text-subtle-foreground transition-colors focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:outline-destructive md:text-sm";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(controlClass, "h-10 pointer-coarse:h-11", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(controlClass, "min-h-24 py-2", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Native select: best mobile UX and fully accessible out of the box. */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(controlClass, "h-10 pointer-coarse:h-11 pr-8", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";
