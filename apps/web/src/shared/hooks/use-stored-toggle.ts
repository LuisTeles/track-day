import { useCallback, useSyncExternalStore } from "react";

// A boolean preference remembered in localStorage for this browser only (a
// convenience, never data). Storage can be unavailable (private mode, blocked
// site data), so values also live in memory and every access is guarded.

const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

function read(key: string, defaultValue: boolean): boolean {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "true";
  } catch {
    return defaultValue;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStoredToggle(key: string, defaultValue: boolean) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, defaultValue),
    // Server render and hydration use the default, so markup always matches.
    () => defaultValue,
  );

  const toggle = useCallback(() => {
    const next = !read(key, defaultValue);
    memory.set(key, next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // ignore: the in-memory value still applies for this session
    }
    listeners.forEach((l) => l());
  }, [key, defaultValue]);

  return [value, toggle] as const;
}
