// Pure helpers for reading gamepad buttons (wheel buttons show up as
// gamepads in Chrome on the same machine; see ADR-006).

export type NavAction = "next" | "prev";

export interface ButtonBinding {
  /** Gamepad.id, e.g. "Logitech G29 Driving Force Racing Wheel (Vendor: 046d Product: c24f)". */
  gamepadId: string;
  button: number;
}

export interface Bindings {
  next: ButtonBinding | null;
  prev: ButtonBinding | null;
}

/** The parts of the Gamepad API we use, so tests can pass plain objects. */
export interface PadLike {
  id: string;
  index: number;
  buttons: readonly { pressed: boolean }[];
}

export type PressState = Map<number, boolean[]>;

/**
 * Buttons that went from released to pressed since `previous`, as
 * `{ gamepadId, button }` pairs, plus the new state to pass next time.
 * Rising edges only: holding a button down fires once.
 */
export function detectPresses(previous: PressState, pads: readonly (PadLike | null)[]) {
  const next: PressState = new Map();
  const pressed: ButtonBinding[] = [];
  for (const pad of pads) {
    if (!pad) continue;
    const now = pad.buttons.map((b) => b.pressed);
    const before = previous.get(pad.index);
    now.forEach((down, button) => {
      // A pad seen for the first time sets the baseline without firing.
      if (before && down && !before[button]) pressed.push({ gamepadId: pad.id, button });
    });
    next.set(pad.index, now);
  }
  return { pressed, state: next };
}

export function actionFor(bindings: Bindings, press: ButtonBinding): NavAction | null {
  const same = (b: ButtonBinding | null) =>
    b !== null && b.gamepadId === press.gamepadId && b.button === press.button;
  if (same(bindings.next)) return "next";
  if (same(bindings.prev)) return "prev";
  return null;
}

/** "Logitech G29 … (Vendor: …)" → "Logitech G29 …" for display. */
export function shortPadName(id: string) {
  return id.replace(/\s*\(.*\)\s*$/, "").trim() || id;
}
