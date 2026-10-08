"use client";

import { useCallback } from "react";
import { useStoredChoice } from "@/shared/hooks/use-stored-choice";
import { applyTheme, THEME_KEY, THEMES, type Theme } from "./theme";

/**
 * The inline script in the root layout applies the stored theme before
 * hydration, so the DOM is only touched when the user picks one. (An effect
 * would see the server snapshot "system" first and undo the script's work.)
 */
export function useTheme() {
  const [theme, setStored] = useStoredChoice<Theme>(THEME_KEY, THEMES, "system");
  const setTheme = useCallback(
    (next: Theme) => {
      setStored(next);
      applyTheme(next);
    },
    [setStored],
  );
  return [theme, setTheme] as const;
}
