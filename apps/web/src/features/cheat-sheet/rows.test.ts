import type { Corner, CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { cheatSheetRows } from "./rows";

const corner = (over: Partial<Corner> = {}) =>
  ({ id: "c1", number: 1, name: null, direction: null, ...over }) as Corner;
const guide = (over: Partial<CornerGuide> = {}) =>
  ({
    gear: null,
    downshiftTo: null,
    brakeReference: null,
    brakeMarkerMeters: null,
    minSpeedKmh: null,
    cue: null,
    source: "manual",
    confidence: null,
    ...over,
  }) as CornerGuide;

describe("cheatSheetRows", () => {
  it("fills dashes when the car has no guide for the corner", () => {
    expect(cheatSheetRows([corner()], () => null)).toEqual([
      {
        number: "T1",
        name: "—",
        direction: "—",
        gear: "—",
        brake: "—",
        minSpeed: "—",
        cue: "—",
        estimate: false,
      },
    ]);
  });

  it("shows the downshift only when it differs from the apex gear", () => {
    const rows = cheatSheetRows(
      [corner({ id: "a" }), corner({ id: "b", number: 2 }), corner({ id: "c", number: 3 })],
      (id) =>
        ({
          a: guide({ gear: 3, downshiftTo: 2 }),
          b: guide({ gear: 3, downshiftTo: 3 }),
          c: guide({ gear: null, downshiftTo: 2 }),
        })[id]!,
    );
    expect(rows.map((r) => r.gear)).toEqual(["3 ↓2", "3", "↓2"]);
  });

  it("uses brakeAtText, the speed in km/h, the cue and the corner's name and direction", () => {
    const [row] = cheatSheetRows([corner({ name: "Senna S", direction: "left" })], () =>
      guide({ brakeMarkerMeters: 100, minSpeedKmh: 87.4, cue: "Late" }),
    );
    expect(row).toMatchObject({
      name: "Senna S",
      direction: "Left",
      brake: "100 m",
      minSpeed: "87 km/h",
      cue: "Late",
    });
  });

  it("flags estimates", () => {
    const rows = cheatSheetRows([corner({ id: "a" }), corner({ id: "b" })], (id) =>
      guide({ source: id === "a" ? "ai" : "manual" }),
    );
    expect(rows.map((r) => r.estimate)).toEqual([true, false]);
  });
});
