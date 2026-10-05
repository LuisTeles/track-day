import type { Corner, Layout } from "@track-day/schema";

/**
 * Where a corner sits along the outline (0–1): its `pathPosition`, or its
 * distance from the start as a fraction of the lap. `null` = unplaceable.
 */
export function cornerFraction(
  corner: Pick<Corner, "pathPosition" | "distanceFromStartMeters">,
  layout: Pick<Layout, "lengthMeters">,
): number | null {
  if (corner.pathPosition != null) return corner.pathPosition;
  if (corner.distanceFromStartMeters != null && layout.lengthMeters) {
    const f = corner.distanceFromStartMeters / layout.lengthMeters;
    return f >= 0 && f < 1 ? f : null;
  }
  return null;
}
