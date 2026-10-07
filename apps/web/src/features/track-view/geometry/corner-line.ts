import { lapDelta } from "./nearest";
import type { TrackPath } from "./path";
import type { Point } from "./types";

/** Half of the nominal 12 m track width (ADR-007). */
export const LINE_OFFSET_M = 6;
const LEAD_M = 40;
const EST_TURN_IN_M = 60;
const EST_EXIT_M = 50;

export interface CornerLineCorner {
  direction: "left" | "right" | null;
  turnIn: number | null;
  apex: number | null;
  exit: number | null;
}

/**
 * A racing line through one corner (or a complex, in lap order): turn-in and
 * exit on the outside edge, apex on the inside, with a short lead-in and
 * lead-out on the outside, smoothed. Points are in path coordinates.
 * `null` when a corner has no apex or no direction.
 */
export function cornerLine({
  path,
  lengthMeters,
  corners,
}: {
  path: TrackPath;
  lengthMeters: number;
  corners: CornerLineCorner[];
}): { points: Point[]; estimated: boolean } | null {
  if (corners.length === 0) return null;
  const unitsPerMeter = path.length / lengthMeters;
  const m = (meters: number) => meters / lengthMeters;
  const offset = LINE_OFFSET_M * unitsPerMeter;

  // Outside of a right-hander is the left-hand side, and vice versa.
  // Right-hand normal of tangent (tx, ty) in y-down coordinates is (−ty, tx).
  const sideAt = (f: number, side: "left" | "right") => {
    const p = path.pointAt(f);
    const t = path.tangentAt(f);
    const s = side === "right" ? 1 : -1;
    return { x: p.x - t.y * offset * s, y: p.y + t.x * offset * s };
  };
  const opposite = (d: "left" | "right") => (d === "left" ? "right" : "left");

  // Unwrapped fractions, relative to the first apex, so a line can cross start/finish.
  const origin = corners[0]!.apex;
  if (origin === null) return null;
  const unwrap = (f: number) => origin + lapDelta(origin, f);

  let estimated = false;
  const controls: Point[] = [];
  let first: { f: number; side: "left" | "right" } | null = null;
  let last: { f: number; side: "left" | "right" } | null = null;

  for (const c of corners) {
    if (c.apex === null || c.direction === null) return null;
    const apex = unwrap(c.apex);
    const turnIn = c.turnIn !== null ? unwrap(c.turnIn) : apex - m(EST_TURN_IN_M);
    const exit = c.exit !== null ? unwrap(c.exit) : apex + m(EST_EXIT_M);
    if (c.turnIn === null || c.exit === null) estimated = true;
    const outside = opposite(c.direction);
    first ??= { f: turnIn, side: outside };
    last = { f: exit, side: outside };
    controls.push(sideAt(turnIn, outside), sideAt(apex, c.direction), sideAt(exit, outside));
  }

  const points = [
    sideAt(first!.f - m(LEAD_M), first!.side),
    ...controls,
    sideAt(last!.f + m(LEAD_M), last!.side),
  ];
  return { points: catmullRom(points), estimated };
}

const knot = (a: Point, b: Point) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-6);
function lerp(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const u = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Centripetal Catmull-Rom through every point (Barry–Goldman), endpoints included. */
export function catmullRom(points: Point[], samplesPerSegment = 12): Point[] {
  if (points.length < 3) return points.slice();
  const n = points.length;
  // Phantom endpoints, mirrored, so the curve starts and ends on the real ones.
  const p = [
    { x: 2 * points[0]!.x - points[1]!.x, y: 2 * points[0]!.y - points[1]!.y },
    ...points,
    { x: 2 * points[n - 1]!.x - points[n - 2]!.x, y: 2 * points[n - 1]!.y - points[n - 2]!.y },
  ];
  const out: Point[] = [points[0]!];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1]!, p[i]!, p[i + 1]!, p[i + 2]!];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / samplesPerSegment;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      out.push(s === samplesPerSegment ? p2 : lerp(b1, b2, t1, t2, t));
    }
  }
  return out;
}

export function pointsToPath(points: Point[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
}
