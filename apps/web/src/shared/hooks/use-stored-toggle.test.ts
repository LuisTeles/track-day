import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStoredToggle } from "./use-stored-toggle";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useStoredToggle", () => {
  it("starts from the default and remembers changes", () => {
    const { result } = renderHook(() => useStoredToggle("test:a", true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem("test:a")).toBe("false");
  });

  it("still toggles when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStoredToggle("test:b", false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });
});
