import { useCallback, useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};

/**
 * Fullscreen toggle. `enabled` is false where the API isn't available (e.g.
 * iPhone Safari, where installing the app is the way to hide browser chrome).
 */
export function useFullscreen() {
  const enabled = useSyncExternalStore(
    subscribe,
    () => document.fullscreenEnabled === true,
    () => false,
  );
  const active = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement !== null,
    () => false,
  );

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Denied (e.g. not triggered by a user gesture): nothing to do.
    }
  }, []);

  return { enabled, active, toggle };
}
