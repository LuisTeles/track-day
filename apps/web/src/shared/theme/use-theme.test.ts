import { act, renderHook } from "@testing-library/react";
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

  it("does not touch the document on mount (the inline script already set it)", () => {
    localStorage.setItem(THEME_KEY, "dark");
    document.documentElement.dataset.theme = "dark";
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe("dark");
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
