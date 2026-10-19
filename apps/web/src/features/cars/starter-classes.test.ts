import { describe, expect, it } from "vitest";
import { missingStarters, STARTER_CLASSES } from "./starter-classes";

describe("missingStarters", () => {
  it("skips names already in the garage, ignoring case and spaces", () => {
    expect(missingStarters([{ name: " gt3 " }, { name: "Drift" }]).map((c) => c.name)).toEqual([
      "Formula",
      "GT4",
      "Road car",
    ]);
  });

  it("offers all of them to an empty garage", () => {
    expect(missingStarters([])).toEqual(STARTER_CLASSES);
  });
});
