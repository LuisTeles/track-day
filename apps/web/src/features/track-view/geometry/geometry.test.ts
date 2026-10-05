// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cornerFraction } from "./anchors";
import { boundsOf, rotatedBounds, rotatePoint } from "./bounds";
import { fitToViewport } from "./fit";
import { outwardNormal, placeLabels, type LabelInput } from "./labels";
import { createTrackPath } from "./path";
import { applyAffine, composeAffine } from "./types";

const SQUARE = "M 0 0 L 100 0 L 100 100 L 0 100 Z";

describe("createTrackPath", () => {
  const path = createTrackPath(SQUARE);

  it("measures the length", () => {
    expect(path.length).toBeCloseTo(400);
  });

  it("finds points at fractions of the lap, wrapping past 1", () => {
    expect(path.pointAt(0)).toEqual({ x: 0, y: 0 });
    expect(path.pointAt(0.25)).toMatchObject({ x: expect.closeTo(100), y: expect.closeTo(0) });
    expect(path.pointAt(0.5)).toMatchObject({ x: expect.closeTo(100), y: expect.closeTo(100) });
    expect(path.pointAt(0.625)).toMatchObject({ x: expect.closeTo(50), y: expect.closeTo(100) });
    expect(path.pointAt(1.125)).toMatchObject({ x: expect.closeTo(50), y: expect.closeTo(0) });
  });

  it("returns unit tangents in the driving direction", () => {
    expect(path.tangentAt(0.125)).toMatchObject({ x: expect.closeTo(1), y: expect.closeTo(0) });
    expect(path.tangentAt(0.375)).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(1) });
  });

  it("samples evenly", () => {
    expect(path.sample(4).map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]);
  });
});

describe("bounds", () => {
  it("rotates around a pivot", () => {
    expect(rotatePoint({ x: 10, y: 0 }, 90, { x: 0, y: 0 })).toMatchObject({
      x: expect.closeTo(0),
      y: expect.closeTo(10),
    });
  });

  it("computes rotated bounds about the shape's center", () => {
    const wide = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 50 },
      { x: 0, y: 50 },
    ];
    const { pivot, bounds } = rotatedBounds(wide, 90);
    expect(pivot).toEqual({ x: 100, y: 25 });
    expect(bounds.maxX - bounds.minX).toBeCloseTo(50);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(200);
    expect(boundsOf(wide)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 50 });
  });
});

describe("fitToViewport", () => {
  const corners = (
    b: { minX: number; minY: number; maxX: number; maxY: number },
    t: ReturnType<typeof fitToViewport>,
  ) => [applyAffine(t, { x: b.minX, y: b.minY }), applyAffine(t, { x: b.maxX, y: b.maxY })];

  it("fits a wide shape to the width and centers it vertically", () => {
    const b = { minX: 10, minY: 10, maxX: 410, maxY: 110 };
    const t = fitToViewport(b, { width: 1000, height: 800 }, 50);
    const [topLeft, bottomRight] = corners(b, t);
    expect(topLeft!.x).toBeCloseTo(50);
    expect(bottomRight!.x).toBeCloseTo(950);
    expect((topLeft!.y + bottomRight!.y) / 2).toBeCloseTo(400);
  });

  it("fits a tall, narrow shape to the height and centers it horizontally", () => {
    const b = { minX: 0, minY: 0, maxX: 50, maxY: 1000 };
    const t = fitToViewport(b, { width: 1200, height: 600 }, 20);
    const [topLeft, bottomRight] = corners(b, t);
    expect(topLeft!.y).toBeCloseTo(20);
    expect(bottomRight!.y).toBeCloseTo(580);
    expect((topLeft!.x + bottomRight!.x) / 2).toBeCloseTo(600);
    expect(bottomRight!.x - topLeft!.x).toBeCloseTo(28); // aspect ratio kept
  });

  it("survives degenerate input", () => {
    const t = fitToViewport({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { width: 0, height: 0 }, 10);
    expect(Number.isFinite(t.k)).toBe(true);
  });

  it("composes with a zoom transform", () => {
    const fit = { k: 2, x: 10, y: 0 };
    const zoom = { k: 3, x: 5, y: 5 };
    const p = { x: 1, y: 1 };
    expect(applyAffine(composeAffine(zoom, fit), p)).toEqual(
      applyAffine(zoom, applyAffine(fit, p)),
    );
  });
});

describe("cornerFraction", () => {
  const layout = { lengthMeters: 4000 };
  it("prefers pathPosition, falls back to distance / length", () => {
    expect(cornerFraction({ pathPosition: 0.3, distanceFromStartMeters: 2000 }, layout)).toBe(0.3);
    expect(cornerFraction({ pathPosition: null, distanceFromStartMeters: 1000 }, layout)).toBe(
      0.25,
    );
  });

  it("returns null when the corner can't be placed", () => {
    expect(
      cornerFraction({ pathPosition: null, distanceFromStartMeters: null }, layout),
    ).toBeNull();
    expect(
      cornerFraction({ pathPosition: null, distanceFromStartMeters: 100 }, { lengthMeters: null }),
    ).toBeNull();
    expect(
      cornerFraction({ pathPosition: null, distanceFromStartMeters: 5000 }, layout),
    ).toBeNull();
  });
});

describe("placeLabels", () => {
  const size = { width: 24, height: 24 };
  const label = (
    id: string,
    x: number,
    y: number,
    extra: Partial<LabelInput> = {},
  ): LabelInput => ({
    id,
    anchor: { x, y },
    size,
    outward: { x: 0, y: -1 },
    ...extra,
  });
  const overlaps = (placed: ReturnType<typeof placeLabels>) => {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!.center;
        const b = placed[j]!.center;
        if (Math.abs(a.x - b.x) < size.width && Math.abs(a.y - b.y) < size.height) return true;
      }
    }
    return false;
  };

  it("keeps labels on their anchors when there is room", () => {
    const placed = placeLabels([label("a", 0, 0), label("b", 100, 0)]);
    expect(placed).toEqual([
      { id: "a", center: { x: 0, y: 0 }, leader: false },
      { id: "b", center: { x: 100, y: 0 }, leader: false },
    ]);
  });

  it("pushes colliding labels outward with a leader line, leaving no overlaps", () => {
    const cluster = [label("a", 0, 0), label("b", 6, 2), label("c", 3, 8), label("d", 10, 10)];
    const placed = placeLabels(cluster);
    expect(placed[0]!.leader).toBe(false);
    expect(placed.slice(1).every((p) => p.leader)).toBe(true);
    expect(overlaps(placed)).toBe(false);
    // First push goes in the outward direction (up).
    expect(placed[1]!.center.y).toBeLessThan(0);
  });

  it("respects manual offsets", () => {
    const placed = placeLabels([label("a", 50, 50, { offset: { dx: 40, dy: 0 } })]);
    expect(placed[0]).toEqual({ id: "a", center: { x: 90, y: 50 }, leader: true });
  });

  it("is deterministic", () => {
    const cluster = Array.from({ length: 12 }, (_, i) => label(String(i), i * 3, i * 2));
    expect(placeLabels(cluster)).toEqual(placeLabels(cluster));
    expect(overlaps(placeLabels(cluster))).toBe(false);
  });
});

describe("outwardNormal", () => {
  it("points away from the centroid", () => {
    // Moving right along the top edge of a shape centered below.
    expect(outwardNormal({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 50 })).toMatchObject({
      x: expect.closeTo(0),
      y: -1,
    });
    // Same tangent, centroid above.
    expect(outwardNormal({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -50 })).toMatchObject({
      x: expect.closeTo(0),
      y: 1,
    });
  });
});
