import type { TrackPath } from "./path";
import type { Point } from "./types";

const COARSE = 1000;
const REFINE = 40;
const wrap = (f: number) => ((f % 1) + 1) % 1;
const dist2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Position along the lap (0–1) of the outline point closest to `p` (path coordinates). */
export function nearestFraction(path: TrackPath, p: Point): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < COARSE; i++) {
    const d = dist2(path.pointAt(i / COARSE), p);
    if (d < bestDist) {
      bestDist = d;
      best = i / COARSE;
    }
  }
  // Refine within one coarse step either side.
  const step = 1 / COARSE;
  let refined = best;
  for (let i = -REFINE; i <= REFINE; i++) {
    const f = best + (step * i) / REFINE;
    const d = dist2(path.pointAt(f), p);
    if (d < bestDist) {
      bestDist = d;
      refined = f;
    }
  }
  const f = wrap(refined);
  return f >= 1 ? 0 : f;
}

/** Signed shortest distance from `from` to `to` around the lap, in fractions (−0.5, 0.5]. */
export function lapDelta(from: number, to: number): number {
  const d = wrap(to - from);
  return d > 0.5 ? d - 1 : d;
}

export type LinePoint = "turnIn" | "apex" | "exit";
export type LinePositions = Record<LinePoint, number | null>;

const ORDER: LinePoint[] = ["turnIn", "apex", "exit"];

/** True when every pair of set points runs turn-in → apex → exit in the driving direction. */
export function checkLineOrder(p: LinePositions): boolean {
  const set = ORDER.filter((k) => p[k] !== null);
  for (let i = 0; i < set.length - 1; i++) {
    if (lapDelta(p[set[i]!]!, p[set[i + 1]!]!) <= 0) return false;
  }
  return true;
}
