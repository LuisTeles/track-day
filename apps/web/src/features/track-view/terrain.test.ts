import { describe, expect, it } from "vitest";
import { terrainOf } from "./terrain";

describe("terrainOf", () => {
  it.each([
    ["uphill", "Uphill"],
    ["downhill", "Downhill"],
    ["crest", "Crest"],
    ["compression", "Compression"],
  ] as const)("names %s elevation", (elevation, text) => {
    expect(terrainOf({ elevation, camber: null })).toEqual({
      text,
      description: text.toLowerCase(),
    });
  });

  it.each([
    ["off-camber", "Off-camber"],
    ["positive", "Banked"],
  ] as const)("names %s camber", (camber, text) => {
    expect(terrainOf({ elevation: null, camber })).toEqual({
      text,
      description: text.toLowerCase(),
    });
  });

  it("is null when nothing is worth showing", () => {
    expect(terrainOf({ elevation: null, camber: null })).toBeNull();
    expect(terrainOf({ elevation: "flat", camber: "flat" })).toBeNull();
    expect(terrainOf({ elevation: "flat", camber: null })).toBeNull();
  });

  it("joins elevation and camber", () => {
    expect(terrainOf({ elevation: "crest", camber: "off-camber" })).toEqual({
      text: "Crest · Off-camber",
      description: "crest, off-camber",
    });
    expect(terrainOf({ elevation: "flat", camber: "positive" })?.text).toBe("Banked");
  });
});
