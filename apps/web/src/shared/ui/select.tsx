import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Native select (best on phones), styled like Input. */
function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "focus-ring h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base text-foreground disabled:opacity-50 md:text-sm pointer-coarse:h-11",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
