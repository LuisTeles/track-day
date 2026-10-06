import type { OsmCorner } from "@track-day/osm-track";
import type { Corner } from "@track-day/schema";
import { cornerFraction } from "@/features/track-view/geometry/anchors";

export type PositionSource = "osm" | "distance" | "none";

export interface MatchedCorner {
  corner: Corner;
  source: PositionSource;
  fraction: number | null;
}

/** The layout's own corners, placed by OSM's tag for the same number when there is one. */
export function matchCorners(
  corners: Corner[],
  osm: OsmCorner[],
  lengthMeters: number,
): MatchedCorner[] {
  const byNumber = new Map(osm.map((o) => [o.number, o.position]));
  return corners.map((corner) => {
    const tagged = byNumber.get(corner.number);
    if (tagged !== undefined) return { corner, source: "osm", fraction: tagged };
    const fraction = cornerFraction({ ...corner, pathPosition: null }, { lengthMeters });
    return fraction === null
      ? { corner, source: "none", fraction: null }
      : { corner, source: "distance", fraction };
  });
}

export function cornerPositionsToSave(matched: MatchedCorner[]) {
  return matched.flatMap((m) =>
    m.source === "osm" && m.fraction !== null
      ? [{ cornerId: m.corner.id, pathPosition: m.fraction }]
      : [],
  );
}
