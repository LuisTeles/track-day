import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, THEME_KEY } from "./theme";
import { useTheme } from "./use-theme";

afterEach(() => {
  // The stored choice also lives in an in-memory map; reset it through the hook.
  const { result, unmount } = renderHook(() => useTheme());
  act(() => result.current[1]("system"));
  unmount();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("applyTheme", () => {
  it("sets data-theme for an explicit choice and removes it for system", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("useTheme", () => {
  it("defaults to system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("system");
  });

  it("stores the choice and applies it to the document", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("light"));
    expect(result.current[0]).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still switches when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("useTheme hydration", () => {
  it("keeps the data-theme set by the inline script", async () => {
    // Fresh module state so the in-memory choice cannot shadow localStorage.
    vi.resetModules();
    const { useTheme: freshUseTheme } = await import("./use-theme");
    function Probe() {
      return createElement("span", null, freshUseTheme()[0]);
    }
    // The server renders the default ("system"); the inline script already
    // applied the stored "dark" before hydration.
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Probe));
    document.body.append(container);
    localStorage.setItem(THEME_KEY, "dark");
    document.documentElement.dataset.theme = "dark";
    // Any attribute write during hydration would be a frame without the theme.
    const writes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => writes.push(...records));
    observer.observe(document.documentElement, { attributes: true });
    await act(async () => {
      hydrateRoot(container, createElement(Probe));
    });
    writes.push(...observer.takeRecords());
    expect(writes).toEqual([]);
    observer.disconnect();
    expect(container.textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    container.remove();
  });
});
