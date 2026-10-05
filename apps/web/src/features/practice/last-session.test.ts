import { afterEach, describe, expect, it, vi } from "vitest";
import { readLastSession, writeLastSession } from "./last-session";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("last practice session", () => {
  it("round-trips per layout", () => {
    writeLastSession("layout-a", { guide: "g1", corner: 7 });
    expect(readLastSession("layout-a")).toEqual({ guide: "g1", corner: 7 });
    expect(readLastSession("layout-b")).toBeNull();
    expect(readLastSession(null)).toBeNull();
  });

  it("ignores corrupt values and storage failures", () => {
    window.localStorage.setItem("practice:last:x", "{not json");
    expect(readLastSession("x")).toBeNull();
    window.localStorage.setItem("practice:last:y", JSON.stringify({ guide: 3, corner: "7" }));
    expect(readLastSession("y")).toEqual({ guide: null, corner: null });

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeLastSession("z", { guide: null, corner: 1 })).not.toThrow();
  });
});
