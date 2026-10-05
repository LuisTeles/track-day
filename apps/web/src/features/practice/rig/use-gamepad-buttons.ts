import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  actionFor,
  detectPresses,
  type Bindings,
  type ButtonBinding,
  type NavAction,
  type PressState,
} from "./gamepad";

const noopSubscribe = () => () => {};
const hasGamepadApi = () => typeof navigator !== "undefined" && "getGamepads" in navigator;

export function useGamepadSupported() {
  return useSyncExternalStore(noopSubscribe, hasGamepadApi, () => false);
}

/**
 * Polls gamepads with requestAnimationFrame while mounted and `active`.
 * In capture mode the first newly pressed button is reported via
 * `onCapture`; otherwise bound buttons trigger `onAction`.
 */
export function useGamepadButtons({
  bindings,
  capturing,
  onAction,
  onCapture,
}: {
  bindings: Bindings;
  capturing: boolean;
  onAction(action: NavAction): void;
  onCapture(binding: ButtonBinding): void;
}) {
  const supported = useGamepadSupported();
  const handlers = useRef({ bindings, capturing, onAction, onCapture });
  useEffect(() => {
    handlers.current = { bindings, capturing, onAction, onCapture };
  });

  const active = supported && (capturing || bindings.next !== null || bindings.prev !== null);

  useEffect(() => {
    if (!active) return;
    let state: PressState = new Map();
    let frame = 0;
    const poll = () => {
      const result = detectPresses(state, navigator.getGamepads());
      state = result.state;
      const h = handlers.current;
      for (const press of result.pressed) {
        if (h.capturing) {
          h.onCapture(press);
          break;
        }
        const action = actionFor(h.bindings, press);
        if (action) h.onAction(action);
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return { supported };
}
