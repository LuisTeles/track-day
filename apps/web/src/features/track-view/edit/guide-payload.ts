import {
  CURRENT_SCHEMA_VERSION,
  type Corner,
  type GuideImportPayload,
  type Layout,
  type Track,
  type TrackImportPayload,
} from "@track-day/schema";

/** The layout in import format, for the car guide prompt; null if facts the AI needs are missing. */
export function trackPayloadFor(
  track: Track,
  layout: Layout,
  corners: Corner[],
): TrackImportPayload | null {
  if (!layout.lengthMeters || !layout.direction) return null;
  if (corners.length === 0 || corners.some((c) => c.direction === null)) return null;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "track",
    track: { name: track.name, aliases: track.aliases, country: track.country, city: track.city },
    layout: { name: layout.name, lengthMeters: layout.lengthMeters, direction: layout.direction },
    corners: corners.map((c) => ({
      number: c.number,
      name: c.name,
      direction: c.direction!,
      type: c.type,
      elevation: c.elevation,
      camber: c.camber,
      distanceFromStartMeters: c.distanceFromStartMeters,
      notes: c.notes || null,
      commonMistakes: c.commonMistakes,
    })),
  };
}

export function missingCorners(payload: GuideImportPayload, corners: Corner[]): number[] {
  const numbers = new Set(corners.map((c) => c.number));
  return payload.corners.map((c) => c.cornerNumber).filter((n) => !numbers.has(n));
}
