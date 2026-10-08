"use client";

import { useEffect } from "react";
import { useStoredChoice } from "@/shared/hooks/use-stored-choice";
import { applyTheme, THEME_KEY, THEMES, type Theme } from "./theme";

export function useTheme() {
  const [theme, setTheme] = useStoredChoice<Theme>(THEME_KEY, THEMES, "system");
  useEffect(() => applyTheme(theme), [theme]);
  return [theme, setTheme] as const;
}
