import { describe, expect, it } from "vitest";
import { shortcutFor } from "./shortcuts";

const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: Element = document.body) =>
  ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    defaultPrevented: false,
    target,
    ...extra,
  }) as KeyboardEvent;

describe("shortcutFor", () => {
  it.each([
    ["[", "prev-corner"],
    ["]", "next-corner"],
    ["+", "zoom-in"],
    ["=", "zoom-in"],
    ["-", "zoom-out"],
    ["0", "reset-view"],
    ["c", "toggle-list"],
    ["e", "toggle-edit"],
    ["?", "help"],
  ])("%s → %s", (k, action) => {
    expect(shortcutFor(key(k))).toBe(action);
  });

  it("ignores keys with Ctrl, Cmd or Alt", () => {
    expect(shortcutFor(key("e", { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key("0", { metaKey: true }))).toBeNull();
    expect(shortcutFor(key("c", { altKey: true }))).toBeNull();
  });

  it("ignores keys typed into fields, selects and editable content", () => {
    for (const html of [
      "<input>",
      "<textarea></textarea>",
      "<select></select>",
      "<div contenteditable='true'></div>",
    ]) {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      expect(shortcutFor(key("e", {}, host.firstElementChild!))).toBeNull();
      host.remove();
    }
  });

  it("ignores keys inside a dialog or menu, and already-handled keys", () => {
    for (const role of ["dialog", "alertdialog", "menu"]) {
      const layer = document.createElement("div");
      layer.setAttribute("role", role);
      const button = document.createElement("button");
      layer.append(button);
      document.body.append(layer);
      expect(shortcutFor(key("e", {}, button))).toBeNull();
      layer.remove();
    }
    expect(shortcutFor(key("e", { defaultPrevented: true }))).toBeNull();
  });

  it("accepts [ and ] typed with AltGr or Option (PT, DE, FR layouts)", () => {
    const altGr = {
      ctrlKey: true,
      altKey: true,
      getModifierState: (k: string) => k === "AltGraph",
    };
    expect(shortcutFor(key("[", altGr))).toBe("prev-corner");
    expect(shortcutFor(key("]", altGr))).toBe("next-corner");
    // macOS: Option produces the symbol, with altKey set.
    expect(shortcutFor(key("[", { altKey: true }))).toBe("prev-corner");
  });

  it("still ignores Ctrl and Cmd combinations without AltGr", () => {
    const noAltGr = { getModifierState: () => false };
    expect(shortcutFor(key("e", { ctrlKey: true, ...noAltGr }))).toBeNull();
    expect(shortcutFor(key("[", { ctrlKey: true, ...noAltGr }))).toBeNull();
    expect(shortcutFor(key("e", { metaKey: true }))).toBeNull();
    expect(shortcutFor(key("[", { metaKey: true }))).toBeNull();
  });

  it("ignores auto-repeat from a held key", () => {
    expect(shortcutFor(key("]", { repeat: true }))).toBeNull();
  });
});
