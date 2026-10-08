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

export function shortcutFor(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">,
): ShortcutAction | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(TYPING) || target?.closest(LAYER)) return null;
  return MAP[e.key] ?? null;
}
