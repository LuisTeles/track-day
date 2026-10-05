import { svgPathProperties } from "svg-path-properties";
import type { Point } from "./types";

export interface TrackPath {
  /** Length in path units. */
  length: number;
  /** Point at a fraction of the path (wraps, so 1.1 = 0.1). */
  pointAt(fraction: number): Point;
  /** Unit tangent (driving direction) at a fraction of the path. */
  tangentAt(fraction: number): Point;
  /** `n` evenly spaced points along the path. */
  sample(n: number): Point[];
}

const wrap = (f: number) => ((f % 1) + 1) % 1;

export function createTrackPath(d: string): TrackPath {
  const props = new svgPathProperties(d);
  const length = props.getTotalLength();

  const tangentAt = (fraction: number) => {
    const t = props.getTangentAtLength(wrap(fraction) * length);
    const n = Math.hypot(t.x, t.y) || 1;
    return { x: t.x / n, y: t.y / n };
  };

  return {
    length,
    pointAt: (fraction) => {
      const p = props.getPointAtLength(wrap(fraction) * length);
      return { x: p.x, y: p.y };
    },
    tangentAt,
    sample: (n) =>
      Array.from({ length: n }, (_, i) => {
        const p = props.getPointAtLength((i / n) * length);
        return { x: p.x, y: p.y };
      }),
  };
}
