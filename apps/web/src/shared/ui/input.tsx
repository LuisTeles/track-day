import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

function Input({ className, suffix, ...props }: ComponentProps<"input"> & { suffix?: string }) {
  const input = (
    <input
      data-slot="input"
      className={cn(
        "focus-ring h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm pointer-coarse:h-11",
        suffix && "pr-12",
        className,
      )}
      {...props}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative">
      {input}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
      >
        {suffix}
      </span>
    </div>
  );
}

export { Input };
