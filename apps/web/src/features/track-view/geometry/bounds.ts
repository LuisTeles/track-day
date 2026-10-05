import type { Bounds, Point } from "./types";

export function rotatePoint(p: Point, degrees: number, pivot: Point): Point {
  if (degrees === 0) return p;
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

/** Rotates a direction vector (no pivot). */
export function rotateVector(v: Point, degrees: number): Point {
  return rotatePoint(v, degrees, { x: 0, y: 0 });
}

export function boundsOf(points: readonly Point[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function centerOf(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * Bounds of the outline after rotating it about its own center. `pivot` is
 * that center, needed to rotate anything else (markers, racing line) the same way.
 */
export function rotatedBounds(samples: readonly Point[], degrees: number) {
  const pivot = centerOf(boundsOf(samples));
  return {
    pivot,
    bounds: boundsOf(samples.map((p) => rotatePoint(p, degrees, pivot))),
  };
}
