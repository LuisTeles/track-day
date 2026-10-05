import { describe, expect, it } from "vitest";
import { isEstimate } from "./estimate";

describe("isEstimate", () => {
  it.each([
    [{ source: "ai", confidence: "high" }, true],
    [{ source: "manual", confidence: "low" }, true],
    [{ source: "manual", confidence: null }, false],
    [{ source: "telemetry", confidence: "medium" }, false],
  ] as const)("%j → %s", (guide, expected) => {
    expect(isEstimate(guide)).toBe(expected);
  });
});
