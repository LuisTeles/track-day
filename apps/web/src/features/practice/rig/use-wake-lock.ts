import { useEffect, useState, useSyncExternalStore } from "react";

export type WakeLockStatus = "active" | "released" | "unsupported" | "error";

const noopSubscribe = () => () => {};

/** Wake Lock needs a secure context (HTTPS or localhost) and browser support. */
function isSupported() {
  return typeof window !== "undefined" && window.isSecureContext && "wakeLock" in navigator;
}

/**
 * Keeps the screen on while mounted (Screen Wake Lock API). Browsers drop the
 * lock when the page is hidden, so it is re-acquired when it becomes visible.
 */
export function useWakeLock(): WakeLockStatus {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, () => false);
  const [status, setStatus] = useState<Exclude<WakeLockStatus, "unsupported">>("released");

  useEffect(() => {
    if (!supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        setStatus("active");
        sentinel.addEventListener("release", () => !cancelled && setStatus("released"));
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [supported]);

  return supported ? status : "unsupported";
}
