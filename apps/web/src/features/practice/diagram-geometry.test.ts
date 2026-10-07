// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackPath } from "@/features/track-view/geometry/path";
import { APPROACH_METERS, cornerDiagram, EXIT_METERS, schematicDiagram } from "./diagram-geometry";

// 1000 × 1000 square driven clockwise on screen: 4000 units for a 4000 m lap → 1 unit = 1 m.
const square = createTrackPath("M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z");
const base = { path: square, lengthMeters: 4000 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("cornerDiagram", () => {
  it("slices from the approach to past the exit, oriented so you drive up the screen", () => {
    // Apex at the top-right corner of the square (a right-hander).
    const d = cornerDiagram({ ...base, corners: [{ apex: 0.25 }] });
    const length = d.centerline.slice(1).reduce((sum, p, i) => sum + dist(p, d.centerline[i]!), 0);
    expect(length).toBeCloseTo(APPROACH_METERS + EXIT_METERS, -1);

    const [p0, p1] = d.centerline;
    expect(p1!.y).toBeLessThan(p0!.y); // moving up
    expect(Math.abs(p1!.x - p0!.x)).toBeLessThan(0.01);
    // After the right-hander the track heads right on screen.
    const [a, b] = d.centerline.slice(-2);
    expect(b!.x).toBeGreaterThan(a!.x);
    expect(d.unitsPerMeter).toBeCloseTo(1);
    expect(d.schematic).toBe(false);
  });

  it("places the brake marker brakeMeters before turn-in, or approximate from the apex", () => {
    const fromApex = cornerDiagram({ ...base, corners: [{ apex: 0.25 }], brakeMeters: 100 });
    const brake = fromApex.markers.find((m) => m.kind === "brake")!;
    const apex = fromApex.markers.find((m) => m.kind === "apex")!;
    expect(brake.approximate).toBe(true);
    expect(dist(brake.point, apex.point)).toBeCloseTo(100, 0);

    // 200 m board: the slice starts at the brake point, earlier than the default approach.
    const fromTurnIn = cornerDiagram({
      ...base,
      corners: [{ apex: 0.25, turnIn: 0.25 - 30 / 4000 }],
      brakeMeters: 200,
    });
    const b2 = fromTurnIn.markers.find((m) => m.kind === "brake")!;
    expect(b2.approximate).toBe(false);
    expect(dist(b2.point, fromTurnIn.centerline[0]!)).toBeLessThan(1);
    expect(fromTurnIn.markers.map((m) => m.kind)).toEqual(["brake", "turn-in", "apex"]);
  });

  it("crosses the start/finish line without jumps", () => {
    const d = cornerDiagram({ ...base, corners: [{ apex: 0.01 }] });
    const gaps = d.centerline.slice(1).map((p, i) => dist(p, d.centerline[i]!));
    expect(Math.max(...gaps)).toBeLessThan(3);
  });

  it("spans a whole complex and slices the racing line alongside", () => {
    const racing = createTrackPath("M 5 5 L 995 5 L 995 995 L 5 995 Z");
    const d = cornerDiagram({
      ...base,
      corners: [{ apex: 0.25 }, { apex: 0.5 }],
      racingLine: racing,
    });
    expect(d.markers.filter((m) => m.kind === "apex")).toHaveLength(2);
    expect(d.racingLine!.length).toBeGreaterThan(10);
    expect(d.lineSource).toBe("layout");
    expect(dist(d.racingLine![0]!, d.centerline[0]!)).toBeLessThan(10);
  });

  it("draws a car's generated line in place of the layout's", () => {
    const line = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    const d = cornerDiagram({ ...base, corners: [{ apex: 0.3 }], line });
    expect(d.lineSource).toBe("car");
    expect(d.racingLine).toHaveLength(2);
  });

  it("reports no line source without a line", () => {
    const d = cornerDiagram({ ...base, corners: [{ apex: 0.3 }] });
    expect(d.lineSource).toBeNull();
  });
});

describe("schematicDiagram", () => {
  it("mirrors left and right and is labelled schematic", () => {
    const left = schematicDiagram("sweeper", "left");
    const right = schematicDiagram("sweeper", "right");
    expect(left.schematic).toBe(true);
    expect(left.centerline.at(-1)!.x).toBeLessThan(0);
    expect(right.centerline.at(-1)!.x).toBeGreaterThan(0);
    expect(left.markers).toHaveLength(1);
  });
});
