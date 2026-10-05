import { useCallback, useSyncExternalStore } from "react";

// Like useStoredToggle, for one of a fixed set of string options. A per-browser
// convenience in localStorage, with an in-memory fallback when storage fails.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStoredChoice<T extends string>(
  key: string,
  options: readonly T[],
  defaultValue: T,
) {
  const read = useCallback((): T => {
    let raw: string | null = memory.get(key) ?? null;
    if (raw === null) {
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        raw = null;
      }
    }
    return options.includes(raw as T) ? (raw as T) : defaultValue;
  }, [key, options, defaultValue]);

  const value = useSyncExternalStore(subscribe, read, () => defaultValue);

  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignore: the in-memory value applies for this session
      }
      listeners.forEach((l) => l());
    },
    [key],
  );

  return [value, set] as const;
}
