// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackPath } from "./path";
import { catmullRom, cornerLine, pointsToPath } from "./corner-line";

const SQUARE = createTrackPath("M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z"); // 4000 units
const LEN = 4000; // 1 unit = 1 m

const at = (meters: number) => meters / LEN;

describe("cornerLine", () => {
  it("puts turn-in and exit outside and the apex inside, for a right-hander", () => {
    // Right-hander on the top straight: inside is +y (right), outside is −y.
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "right", turnIn: at(400), apex: at(500), exit: at(600) }],
    })!;
    expect(line.estimated).toBe(false);
    const nearX = (x: number) =>
      line.points.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    expect(nearX(400).y).toBeCloseTo(-6, 0);
    expect(nearX(500).y).toBeCloseTo(6, 0);
    expect(nearX(600).y).toBeCloseTo(-6, 0);
    // Lead-in and lead-out 40 m outside the turn-in and exit.
    expect(line.points[0]).toMatchObject({ x: expect.closeTo(360, 0), y: expect.closeTo(-6, 0) });
    expect(line.points.at(-1)).toMatchObject({
      x: expect.closeTo(640, 0),
      y: expect.closeTo(-6, 0),
    });
  });

  it("mirrors the sides for a left-hander", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "left", turnIn: at(400), apex: at(500), exit: at(600) }],
    })!;
    const apex = line.points.reduce((a, b) => (Math.abs(b.x - 500) < Math.abs(a.x - 500) ? b : a));
    expect(apex.y).toBeCloseTo(-6, 0);
  });

  it("estimates turn-in and exit from the apex alone", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "right", turnIn: null, apex: at(500), exit: null }],
    })!;
    expect(line.estimated).toBe(true);
    // Lead-in = 60 m (estimated turn-in) + 40 m before the apex.
    expect(line.points[0]!.x).toBeCloseTo(400, 0);
    expect(line.points.at(-1)!.x).toBeCloseTo(590, 0);
  });

  it("returns null without an apex or a direction", () => {
    expect(
      cornerLine({
        path: SQUARE,
        lengthMeters: LEN,
        corners: [{ direction: "right", turnIn: at(400), apex: null, exit: at(600) }],
      }),
    ).toBeNull();
    expect(
      cornerLine({
        path: SQUARE,
        lengthMeters: LEN,
        corners: [{ direction: null, turnIn: null, apex: at(500), exit: null }],
      }),
    ).toBeNull();
  });

  it("follows a corner across the start/finish line without crossing the lap", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [{ direction: "right", turnIn: at(3950), apex: at(10), exit: at(80) }],
    })!;
    // Every point stays near the start corner (0, 0).
    for (const p of line.points) expect(Math.hypot(p.x, p.y)).toBeLessThan(200);
  });

  it("joins the corners of a complex in lap order", () => {
    const line = cornerLine({
      path: SQUARE,
      lengthMeters: LEN,
      corners: [
        { direction: "left", turnIn: at(300), apex: at(350), exit: at(400) },
        { direction: "right", turnIn: at(450), apex: at(500), exit: at(550) },
      ],
    })!;
    const xs = line.points.map((p) => p.x);
    expect(xs[0]).toBeCloseTo(260, 0);
    expect(xs.at(-1)).toBeCloseTo(590, 0);
    // Monotonic along the straight.
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - 1e-6);
  });
});

describe("catmullRom", () => {
  it("passes through every control point", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];
    const curve = catmullRom(pts, 8);
    for (const p of pts) {
      expect(curve.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true);
    }
  });
});

describe("pointsToPath", () => {
  it("writes an SVG polyline", () => {
    expect(
      pointsToPath([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe("M1 2 L3 4");
  });
});
