import type { CornerGuide, Guide } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { chipsFor, guideLabel } from "./guides";

const cornerGuide = (cornerId: string, extra: Partial<CornerGuide>) =>
  ({ cornerId, ...extra }) as CornerGuide;

describe("chipsFor", () => {
  it("shows minimum speed and gear, flagging AI estimates", () => {
    const chips = chipsFor([
      cornerGuide("a", { minSpeedKmh: 69.6, gear: 2, source: "ai" }),
      cornerGuide("b", { minSpeedKmh: null, gear: 4, source: "manual" }),
      cornerGuide("c", { minSpeedKmh: null, gear: null, source: "manual" }),
    ]);
    expect(chips.get("a")).toEqual({
      text: "70 km/h · G2",
      description: "minimum 70 km/h, gear 2",
      estimate: true,
    });
    expect(chips.get("b")).toEqual({ text: "G4", description: "gear 4", estimate: false });
    expect(chips.has("c")).toBe(false);
  });
});

describe("guideLabel", () => {
  const base = { sim: null } as Guide;
  it("names the car or class and the sim", () => {
    expect(
      guideLabel(
        { ...base, target: { carClassId: "k" } },
        [{ id: "k", name: "Road car" }] as never,
        [],
      ),
    ).toBe("Road car · any sim");
    expect(
      guideLabel({ ...base, target: { carId: "m" }, sim: "iracing" }, [], [
        { id: "m", name: "MX-5" },
      ] as never),
    ).toBe("MX-5 · iRacing");
  });
});
