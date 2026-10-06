import type { OsmCorner } from "@track-day/osm-track";
import type { Corner } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { cornerPositionsToSave, matchCorners } from "./match-corners";

const corner = (number: number, distanceFromStartMeters: number | null): Corner =>
  ({ id: `c${number}`, number, distanceFromStartMeters, pathPosition: null }) as Corner;
const osm = (number: number, position: number): OsmCorner => ({
  number,
  name: null,
  position,
  direction: "left",
});

describe("matchCorners", () => {
  it("uses OSM positions by number, else distance, else nothing", () => {
    const matched = matchCorners(
      [corner(1, 400), corner(2, 1000), corner(3, null)],
      [osm(1, 0.1), osm(9, 0.9)],
      4000,
    );
    expect(matched.map((m) => [m.corner.number, m.source, m.fraction])).toEqual([
      [1, "osm", 0.1],
      [2, "distance", 0.25],
      [3, "none", null],
    ]);
  });

  it("uses the given lap length for distance placement", () => {
    expect(matchCorners([corner(2, 1000)], [], 5000)[0]!.fraction).toBe(0.2);
  });

  it("saves positions for OSM-matched corners only", () => {
    const matched = matchCorners([corner(1, 400), corner(2, 1000)], [osm(1, 0.1)], 4000);
    expect(cornerPositionsToSave(matched)).toEqual([{ cornerId: "c1", pathPosition: 0.1 }]);
  });
});
