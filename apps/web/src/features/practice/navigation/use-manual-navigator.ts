import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { clampIndex, nextIndex, prevIndex, type CornerNavigator } from "./corner-navigator";

interface Options {
  count: number;
  current: number;
  onChange(index: number): void;
  onExit?(): void;
}

const SWIPE_PX = 50;
const TAP_MOVE_PX = 10;
const TAP_MS = 500;

/** Elements that own every key (typing, choosing an option). */
const TEXT_ENTRY = "input, select, textarea, [contenteditable]";
/** Elements that handle their own clicks/taps. */
const INTERACTIVE = `${TEXT_ENTRY}, button, a, [data-no-nav]`;

const matches = (target: EventTarget | null, selector: string) =>
  target instanceof Element && target.closest(selector) !== null;

/**
 * Space activates a focused button or link, so it must not also advance;
 * arrows and paging keys don't, so they still navigate from there.
 */
function ownsKey(target: EventTarget | null, key: string) {
  if (matches(target, TEXT_ENTRY)) return true;
  return key === " " && matches(target, "button, a");
}

/**
 * Manual CornerNavigator: keyboard (→/Space/PageDown next, ←/PageUp prev,
 * Home first, Esc exit) plus tap zones and swipes on a surface element.
 * Text fields keep their keys, and Space on a focused button only presses
 * the button, so it never also advances the corner.
 */
export function useManualNavigator({ count, current, onChange, onExit }: Options) {
  const navigator = useMemo<CornerNavigator>(
    () => ({
      current,
      count,
      next: () => onChange(nextIndex(current, count)),
      prev: () => onChange(prevIndex(current, count)),
      goTo: (index) => onChange(clampIndex(index, count)),
    }),
    [current, count, onChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || ownsKey(e.target, e.key)) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          navigator.next();
          break;
        case "ArrowLeft":
        case "PageUp":
          navigator.prev();
          break;
        case "Home":
          navigator.goTo(0);
          break;
        case "Escape":
          if (!onExit) return;
          onExit();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigator, onExit]);

  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const surfaceProps = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      start.current = matches(e.target, INTERACTIVE)
        ? null
        : { x: e.clientX, y: e.clientY, t: e.timeStamp };
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        // Swipe left = next, like turning a page.
        if (dx < 0) navigator.next();
        else navigator.prev();
        return;
      }
      if (Math.hypot(dx, dy) <= TAP_MOVE_PX && e.timeStamp - s.t <= TAP_MS) {
        const rect = e.currentTarget.getBoundingClientRect();
        // Right two thirds = next, left third = previous.
        if (e.clientX - rect.left < rect.width / 3) navigator.prev();
        else navigator.next();
      }
    },
  };

  return { navigator, surfaceProps };
}
