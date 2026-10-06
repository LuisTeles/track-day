import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, toKnownFacts } from "./known-facts";

describe("toKnownFacts", () => {
  it("leaves out empty fields", () => {
    expect(toKnownFacts(EMPTY_DRAFT)).toEqual({});
  });

  it("trims text and converts numbers", () => {
    expect(
      toKnownFacts({
        trackName: "  Interlagos ",
        layoutName: "GP",
        lengthMeters: "4309",
        direction: "anticlockwise",
        cornerCount: "15",
        sim: "assetto-corsa",
      }),
    ).toEqual({
      trackName: "Interlagos",
      layoutName: "GP",
      lengthMeters: 4309,
      direction: "anticlockwise",
      cornerCount: 15,
      sim: "assetto-corsa",
    });
  });

  it.each(["0", "-5", "abc", "  "])("leaves out an invalid lap length %j", (lengthMeters) => {
    expect(toKnownFacts({ ...EMPTY_DRAFT, lengthMeters })).toEqual({});
  });

  it("rounds a decimal lap length to whole meters", () => {
    expect(toKnownFacts({ ...EMPTY_DRAFT, lengthMeters: "4309.4" })).toEqual({
      lengthMeters: 4309,
    });
  });

  it.each(["0", "2.5", "x"])("leaves out an invalid corner count %j", (cornerCount) => {
    expect(toKnownFacts({ ...EMPTY_DRAFT, cornerCount })).toEqual({});
  });
});
