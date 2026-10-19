import type { CornerGuide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { emptyCornerGuide } from "@/features/track-view/edit/corner-guide-draft";
import { compareRows } from "./compare-rows";

const guide = (patch: Partial<CornerGuide>) =>
  ({ ...emptyCornerGuide("g", "c"), id: "x", ...patch }) as CornerGuide;

describe("compareRows", () => {
  it("lines up both cars' values and flags differences", () => {
    const rows = compareRows(
      guide({ minSpeedKmh: 70, gear: 2, downshiftTo: 1, brakeMarkerMeters: 100 }),
      guide({ minSpeedKmh: 70, gear: 3 }),
    );
    expect(rows).toEqual([
      { term: "Minimum", a: "70 km/h", b: "70 km/h", differs: false },
      { term: "Gear", a: "2 (↓1)", b: "3", differs: true },
      { term: "Brake", a: "100 m", b: "—", differs: false },
    ]);
  });

  it("marks estimates as text and handles a car with nothing for the corner", () => {
    const rows = compareRows(guide({ gear: 2, source: "ai" }), undefined);
    expect(rows).toEqual([{ term: "Gear", a: "2 (est.)", b: "—", differs: false }]);
  });
});
