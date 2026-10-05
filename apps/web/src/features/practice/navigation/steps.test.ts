import type { Corner, CornerComplex, CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { clampIndex, nextIndex, prevIndex } from "./corner-navigator";
import { buildSteps, stepGuide, stepIndexOf } from "./steps";

const corner = (number: number) => ({ id: `c${number}`, number }) as Corner;
const corners = [1, 2, 3, 4, 5].map(corner);
const complexes = [
  { name: "S", cornerIds: ["c1", "c2"] } as CornerComplex,
  { name: "Lago", cornerIds: ["c4", "c5"] } as CornerComplex,
];

describe("buildSteps", () => {
  it("makes one step per corner", () => {
    expect(
      buildSteps(corners, complexes, "corner").map((s) => s.corners.map((c) => c.number)),
    ).toEqual([[1], [2], [3], [4], [5]]);
  });

  it("merges complexes into one step in complex mode", () => {
    const steps = buildSteps(corners, complexes, "complex");
    expect(steps.map((s) => s.corners.map((c) => c.number))).toEqual([[1, 2], [3], [4, 5]]);
    expect(steps[0]!.complex?.name).toBe("S");
    expect(stepIndexOf(steps, 2)).toBe(0);
    expect(stepIndexOf(steps, 5)).toBe(2);
    expect(stepIndexOf(steps, 99)).toBe(0);
  });
});

describe("navigation indices", () => {
  it("wraps around the lap", () => {
    expect(nextIndex(4, 5)).toBe(0);
    expect(prevIndex(0, 5)).toBe(4);
    expect(nextIndex(1, 5)).toBe(2);
    expect(nextIndex(0, 0)).toBe(0);
  });

  it("clamps goTo targets", () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2.7, 5)).toBe(2);
  });
});

describe("stepGuide", () => {
  const guides: Record<string, Partial<CornerGuide>> = {
    c1: { brakeReference: "100 m", minSpeedKmh: 80, gear: 3 },
    c2: { brakeReference: "lift", minSpeedKmh: 70, gear: 2 },
  };
  const guideFor = (id: string) => (guides[id] as CornerGuide) ?? null;

  it("uses the first corner's braking and the complex's slowest point", () => {
    const [senna] = buildSteps(corners, complexes, "complex");
    expect(stepGuide(senna!, guideFor)).toMatchObject({
      brakeReference: "100 m",
      minSpeedKmh: 70,
      gear: 2,
    });
  });

  it("returns a single corner's own guide or null", () => {
    expect(stepGuide({ corners: [corner(2)], complex: null }, guideFor)).toMatchObject({
      brakeReference: "lift",
    });
    expect(stepGuide({ corners: [corner(3)], complex: null }, guideFor)).toBeNull();
  });
});
