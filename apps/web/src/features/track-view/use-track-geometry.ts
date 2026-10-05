import { useMemo } from "react";
import { centerOf, rotatedBounds, rotatePoint } from "./geometry/bounds";
import { createTrackPath, type TrackPath } from "./geometry/path";
import type { Bounds, Point } from "./geometry/types";

export interface TrackGeometry {
  path: TrackPath;
  /** Bounds after rotation, used for fitting. */
  bounds: Bounds;
  /** Center the rotation is applied around. */
  pivot: Point;
  rotation: number;
  /** Center of the rotated outline, used to pick the "outside" of the track. */
  centroid: Point;
  /** Outline point at a lap fraction, rotated into display space. */
  pointAt(fraction: number): Point;
  /** Driving direction at a lap fraction, rotated into display space. */
  tangentAt(fraction: number): Point;
}

const SAMPLES = 400;

export function useTrackGeometry(outlinePath: string, rotation: number): TrackGeometry {
  return useMemo(() => {
    const path = createTrackPath(outlinePath);
    const samples = path.sample(SAMPLES);
    const { bounds, pivot } = rotatedBounds(samples, rotation);
    const rotate = (p: Point) => rotatePoint(p, rotation, pivot);
    const origin = { x: 0, y: 0 };
    return {
      path,
      bounds,
      pivot,
      rotation,
      centroid: centerOf(bounds),
      pointAt: (f) => rotate(path.pointAt(f)),
      tangentAt: (f) => rotatePoint(path.tangentAt(f), rotation, origin),
    };
  }, [outlinePath, rotation]);
}
