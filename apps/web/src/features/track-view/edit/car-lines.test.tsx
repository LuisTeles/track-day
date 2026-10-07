// @vitest-environment node
import type { Corner, CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { emptyCornerGuide } from "./corner-guide-draft";
import { carLines } from "./car-lines";

const corner = (id: string, direction: Corner["direction"]) =>
  ({ id, direction, pathPosition: 0.125, distanceFromStartMeters: null }) as Corner;
const cg = (cornerId: string, line: Partial<CornerGuide["line"]>) =>
  ({
    ...emptyCornerGuide("g1", cornerId),
    id: `cg-${cornerId}`,
    line: {
      turnIn: null,
      apex: null,
      exit: null,
      turnInAt: null,
      apexAt: null,
      exitAt: null,
      ...line,
    },
  }) as CornerGuide;

describe("carLines", () => {
  const outlinePath = "M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z";
  it("builds a line for each corner the car has points for", () => {
    const lines = carLines({
      outlinePath,
      lengthMeters: 4000,
      corners: [corner("a", "right"), corner("b", "left"), corner("c", null)],
      cornerGuides: [cg("a", { apexAt: 0.125 }), cg("b", {}), cg("c", { apexAt: 0.3 })],
    });
    expect(lines.map((l) => l.cornerId)).toEqual(["a"]);
    expect(lines[0]!.d).toMatch(/^M/);
    expect(lines[0]!.estimated).toBe(true);
  });

  it("returns nothing without a lap length", () => {
    expect(
      carLines({
        outlinePath,
        lengthMeters: null,
        corners: [corner("a", "right")],
        cornerGuides: [cg("a", { apexAt: 0.125 })],
      }),
    ).toEqual([]);
  });

  it("falls back to the corner's position for the apex", () => {
    const lines = carLines({
      outlinePath,
      lengthMeters: 4000,
      corners: [corner("a", "right")],
      cornerGuides: [cg("a", { turnInAt: 0.11 })],
    });
    expect(lines).toHaveLength(1);
  });
});
