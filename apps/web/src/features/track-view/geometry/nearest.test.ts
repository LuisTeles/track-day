// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackPath } from "./path";
import { checkLineOrder, lapDelta, nearestFraction } from "./nearest";

const SQUARE = createTrackPath("M 0 0 L 100 0 L 100 100 L 0 100 Z");

describe("nearestFraction", () => {
  it("snaps a point near the outline to its position along the lap", () => {
    expect(nearestFraction(SQUARE, { x: 50, y: -8 })).toBeCloseTo(0.125, 3);
    expect(nearestFraction(SQUARE, { x: 108, y: 50 })).toBeCloseTo(0.375, 3);
  });

  it("stays below 1 near the start", () => {
    const f = nearestFraction(SQUARE, { x: -3, y: 1 });
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
    expect(Math.min(f, 1 - f)).toBeLessThan(0.01);
  });
});

describe("lapDelta", () => {
  it("is the signed shortest way round", () => {
    expect(lapDelta(0.2, 0.3)).toBeCloseTo(0.1);
    expect(lapDelta(0.3, 0.2)).toBeCloseTo(-0.1);
    expect(lapDelta(0.98, 0.01)).toBeCloseTo(0.03);
    expect(lapDelta(0.01, 0.98)).toBeCloseTo(-0.03);
  });
});

describe("checkLineOrder", () => {
  it("accepts turn-in, apex, exit in lap order, including across the start", () => {
    expect(checkLineOrder({ turnIn: 0.1, apex: 0.12, exit: 0.14 })).toBe(true);
    expect(checkLineOrder({ turnIn: 0.98, apex: 0.005, exit: 0.02 })).toBe(true);
  });

  it("refuses points out of order", () => {
    expect(checkLineOrder({ turnIn: 0.13, apex: 0.12, exit: null })).toBe(false);
    expect(checkLineOrder({ turnIn: null, apex: 0.12, exit: 0.11 })).toBe(false);
    expect(checkLineOrder({ turnIn: 0.2, apex: null, exit: 0.1 })).toBe(false);
  });

  it("accepts any single point and an empty line", () => {
    expect(checkLineOrder({ turnIn: 0.5, apex: null, exit: null })).toBe(true);
    expect(checkLineOrder({ turnIn: null, apex: null, exit: null })).toBe(true);
  });
});
