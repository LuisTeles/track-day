import type { TrackImportPayload } from "../../packages/schema/src/index";

export interface TrackConfig {
  /** Output: examples/<id>.track.json */
  id: string;
  /** south, west, north, east */
  bbox: [number, number, number, number];
  /** Facts not in OSM: these become the payload's track/layout fields. */
  track: TrackImportPayload["track"];
  layout: Pick<TrackImportPayload["layout"], "name" | "lengthMeters" | "direction">;
  /** OSM tag to read names from, e.g. "name:en"; falls back to "name". */
  nameTag?: string;
  /** Fix spelling in OSM corner names. */
  nameOverrides?: Record<string, string>;
  /** Corner details OSM doesn't have, keyed by corner number; only applied when the name matches. */
  details?: Record<number, Partial<TrackImportPayload["corners"][number]>>;
}

export const TRACKS: TrackConfig[] = [
  {
    id: "interlagos",
    bbox: [-23.712, -46.706, -23.695, -46.69],
    track: {
      name: "Autódromo José Carlos Pace",
      aliases: ["Interlagos"],
      country: "BR",
      city: "São Paulo",
      sims: [
        { sim: "assetto-corsa", trackId: null },
        { sim: "iracing", trackId: null },
      ],
    },
    layout: { name: "GP", lengthMeters: 4309, direction: "anticlockwise" },
    nameOverrides: { Pinherinho: "Pinheirinho" },
    details: {
      1: { type: "chicane", elevation: "downhill" },
      2: { type: "chicane", elevation: "downhill" },
      3: { type: "sweeper" },
      10: { type: "hairpin" },
      11: { elevation: "downhill" },
    },
  },
  {
    // Figure-eight with a crossover bridge: a very different shape from Interlagos.
    id: "suzuka",
    bbox: [34.828, 136.5, 34.856, 136.552],
    track: {
      name: "Suzuka International Racing Course",
      aliases: ["Suzuka"],
      country: "JP",
      city: "Suzuka",
      sims: [],
    },
    layout: { name: "GP", lengthMeters: 5807, direction: "clockwise" },
    nameTag: "name:en",
    // The chicane's two halves carry the old and new sponsor names.
    nameOverrides: { "Hitachi Automotive Systems Chicane": "Hitachi Astemo Chicane" },
  },
];
