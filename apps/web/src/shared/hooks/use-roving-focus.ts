import { useCallback, useRef, type KeyboardEvent } from "react";

const FOCUSABLE = "button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])";

/**
 * Toolbar keyboard contract (WAI-ARIA APG): Left/Right move between
 * controls, Home/End jump, wrapping at the ends. Up/Down are left alone so a
 * focused <select> keeps working. Tab still enters and leaves normally.
 */
export function useRovingFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    items[next]?.focus();
  }, []);
  return { ref, onKeyDown };
}
