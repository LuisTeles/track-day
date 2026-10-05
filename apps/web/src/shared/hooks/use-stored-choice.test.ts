import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredChoice } from "./use-stored-choice";

const SIZES = ["S", "M", "L"] as const;

afterEach(() => window.localStorage.clear());

describe("useStoredChoice", () => {
  it("defaults, stores and ignores unknown stored values", () => {
    window.localStorage.setItem("test:size", "XL");
    const { result } = renderHook(() => useStoredChoice("test:size", SIZES, "M"));
    expect(result.current[0]).toBe("M");
    act(() => result.current[1]("L"));
    expect(result.current[0]).toBe("L");
    expect(window.localStorage.getItem("test:size")).toBe("L");
  });
});
