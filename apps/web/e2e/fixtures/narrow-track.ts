// A synthetic, very long and narrow track (about 16:1) as a backup payload,
// to check that auto-fit and label placement hold up for extreme shapes.
const now = "2026-10-04T00:00:00.000Z";
const base = (id: string) => ({ id, createdAt: now, updatedAt: now, deletedAt: null });
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const TRACK = uuid(1);
const LAYOUT = uuid(2);
// Out along the bottom, a hairpin, back along the top.
const outline =
  "M 40 60 L 960 60 Q 1000 60 1000 30 Q 1000 0 960 0 L 40 0 Q 0 0 0 30 Q 0 60 40 60 Z";
const positions = [0.05, 0.1, 0.14, 0.3, 0.42, 0.47, 0.5, 0.53, 0.7, 0.86, 0.9, 0.95];

export const NARROW_CORNERS = positions.length;

export const narrowTrackBackup = {
  schemaVersion: 1,
  kind: "backup",
  exportedAt: now,
  data: {
    tracks: [
      {
        ...base(TRACK),
        name: "Narrow Test Circuit",
        aliases: [],
        country: null,
        city: null,
        sims: [],
      },
    ],
    layouts: [
      {
        ...base(LAYOUT),
        trackId: TRACK,
        name: "Long",
        lengthMeters: 2000,
        direction: "anticlockwise",
        mapAssetId: null,
        outlinePath: outline,
        rotation: null,
        racingLine: null,
      },
    ],
    corners: positions.map((pathPosition, i) => ({
      ...base(uuid(100 + i)),
      layoutId: LAYOUT,
      number: i + 1,
      name: null,
      direction: i % 2 ? "right" : "left",
      type: null,
      elevation: null,
      camber: null,
      pathPosition,
      labelOffset: null,
      order: i,
      distanceFromStartMeters: null,
      notes: "",
      commonMistakes: [],
    })),
    segments: [],
    complexes: [],
    carClasses: [],
    cars: [],
    guides: [],
    cornerGuides: [],
    assets: [],
  },
};
