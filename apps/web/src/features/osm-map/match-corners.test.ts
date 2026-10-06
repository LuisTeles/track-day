import type { NamedSection, OsmCorner } from "@track-day/osm-track";
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

describe("matchCorners by section name", () => {
  const named = (number: number, name: string, distance = 100): Corner =>
    ({
      id: `c${number}`,
      number,
      name,
      distanceFromStartMeters: distance,
      pathPosition: null,
    }) as Corner;
  const section = (
    name: string,
    from: number,
    to: number,
    aliases: string[] = [],
  ): NamedSection => ({
    name,
    aliases,
    from,
    to,
  });

  it("puts a corner in the middle of the section with its name", () => {
    const [m] = matchCorners([named(3, "Curva Biassono")], [], 5793, [
      section("Curva Biassono", 0.2, 0.3),
    ]);
    expect(m).toMatchObject({ source: "name" });
    expect(m!.fraction).toBeCloseTo(0.25, 6);
  });

  it("spreads corners sharing a name across the section, in number order", () => {
    const matched = matchCorners(
      [named(2, "Variante del Rettifilo"), named(1, "Variante del Rettifilo")],
      [],
      5793,
      [section("Variante del Rettifilo", 0.1, 0.14)],
    );
    const byNumber = Object.fromEntries(matched.map((m) => [m.corner.number, m.fraction]));
    expect(byNumber[1]).toBeCloseTo(0.11, 6);
    expect(byNumber[2]).toBeCloseTo(0.13, 6);
  });

  it("ignores case, accents and punctuation, and matches old names", () => {
    const matched = matchCorners(
      [named(11, "curva parabolica"), named(7, "Lesmo-2"), named(9, "Variante Áscari")],
      [],
      5793,
      [
        section("Curva Alboreto", 0.9, 0.96, ["Curva Parabolica"]),
        section("Lesmo 2", 0.5, 0.52),
        section("Variante Ascari", 0.7, 0.74),
      ],
    );
    expect(matched.every((m) => m.source === "name")).toBe(true);
  });

  it("handles a section that crosses the start line", () => {
    const [m] = matchCorners([named(11, "Parabolica")], [], 5793, [
      section("Parabolica", 0.98, 0.02),
    ]);
    expect(m!.fraction).toBeCloseTo(0, 6);
  });

  it("prefers OSM's corner number over a name, and a name over the distance", () => {
    const matched = matchCorners(
      [named(1, "Lesmo 1", 1000), named(2, "Unknown bend", 2000)],
      [osm(1, 0.4)],
      4000,
      [section("Lesmo 1", 0.6, 0.62)],
    );
    expect(matched.map((m) => [m.source, m.fraction])).toEqual([
      ["osm", 0.4],
      ["distance", 0.5],
    ]);
  });

  it("saves name-matched positions too", () => {
    const matched = matchCorners([named(3, "Curva Biassono")], [], 5793, [
      section("Curva Biassono", 0.2, 0.3),
    ]);
    expect(cornerPositionsToSave(matched)).toEqual([{ cornerId: "c3", pathPosition: 0.25 }]);
  });
});
