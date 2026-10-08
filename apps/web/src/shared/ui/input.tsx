import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "focus-ring h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm pointer-coarse:h-11",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
