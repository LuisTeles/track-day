"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./use-theme";
import type { Theme } from "./theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Three-way segmented control; native radios give arrow-key behavior for free. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-lg border border-border p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <label
          key={value}
          title={label}
          className="relative grid size-9 cursor-pointer place-items-center rounded-md text-muted has-checked:bg-surface has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring pointer-coarse:size-10"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => setTheme(value)}
            aria-label={label}
            className="sr-only"
          />
          <Icon aria-hidden className="size-4" />
        </label>
      ))}
    </div>
  );
}
