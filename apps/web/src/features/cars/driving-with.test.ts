import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDrivingWith } from "./driving-with";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useDrivingWith", () => {
  it("remembers the car and sim, shared by every user of the hook", () => {
    const a = renderHook(() => useDrivingWith());
    const b = renderHook(() => useDrivingWith());
    expect(a.result.current[0]).toBeNull();
    act(() => a.result.current[1]({ carId: "c1", sim: "iracing" }));
    expect(b.result.current[0]).toEqual({ carId: "c1", sim: "iracing" });
    expect(JSON.parse(window.localStorage.getItem("driving-with")!)).toEqual({
      carId: "c1",
      sim: "iracing",
    });
    act(() => a.result.current[1](null));
    expect(b.result.current[0]).toBeNull();
  });

  it("ignores junk in storage and an unknown sim", () => {
    window.localStorage.setItem("driving-with", "{nope");
    expect(renderHook(() => useDrivingWith()).result.current[0]).toBeNull();
    window.localStorage.setItem("driving-with", JSON.stringify({ carId: "c1", sim: "pong" }));
    expect(renderHook(() => useDrivingWith()).result.current[0]).toEqual({
      carId: "c1",
      sim: null,
    });
  });

  it("keeps working in memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() => useDrivingWith());
    act(() => result.current[1]({ carId: "c2", sim: null }));
    expect(result.current[0]).toEqual({ carId: "c2", sim: null });
  });
});
