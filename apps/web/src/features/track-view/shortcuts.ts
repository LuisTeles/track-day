export type ShortcutAction =
  | "prev-corner"
  | "next-corner"
  | "zoom-in"
  | "zoom-out"
  | "reset-view"
  | "toggle-list"
  | "toggle-edit"
  | "help";

export const SHORTCUTS: { keys: string; action: ShortcutAction; description: string }[] = [
  { keys: "[", action: "prev-corner", description: "Previous corner" },
  { keys: "]", action: "next-corner", description: "Next corner" },
  { keys: "+", action: "zoom-in", description: "Zoom in" },
  { keys: "−", action: "zoom-out", description: "Zoom out" },
  { keys: "0", action: "reset-view", description: "Reset view" },
  { keys: "C", action: "toggle-list", description: "Show or hide the corner list" },
  { keys: "E", action: "toggle-edit", description: "Turn editing on or off" },
  { keys: "?", action: "help", description: "Show these shortcuts" },
];

const MAP: Record<string, ShortcutAction> = {
  "[": "prev-corner",
  "]": "next-corner",
  "+": "zoom-in",
  "=": "zoom-in",
  "-": "zoom-out",
  "0": "reset-view",
  c: "toggle-list",
  C: "toggle-list",
  e: "toggle-edit",
  E: "toggle-edit",
  "?": "help",
};

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const LAYER = "[role=dialog], [role=alertdialog], [role=menu]";

type KeyInfo = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "target" | "defaultPrevented"
> &
  Partial<Pick<KeyboardEvent, "getModifierState">>;

/** True when a plain key press must be left alone: typing, an open dialog or menu, repeats, Ctrl/Cmd. */
export function keyIsBlocked(e: KeyInfo): boolean {
  if (e.defaultPrevented || e.repeat || e.metaKey) return true;
  // AltGr reports Ctrl+Alt on Windows; it types `[` `]` on PT, DE and FR layouts.
  if (e.ctrlKey && !e.getModifierState?.("AltGraph")) return true;
  // Alt (Option on a Mac) also types symbols, but Alt+letter is a browser/OS combo.
  if ((e.altKey || e.ctrlKey) && /^[a-z]$/i.test(e.key)) return true;
  const target = e.target instanceof Element ? e.target : null;
  return !!(target?.closest(TYPING) || target?.closest(LAYER));
}

export function shortcutFor(e: KeyInfo): ShortcutAction | null {
  if (keyIsBlocked(e)) return null;
  return MAP[e.key] ?? null;
}
