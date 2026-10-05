import { readFileSync } from "node:fs";
import { TrackImportPayload } from "@track-day/schema";
import { describe, expect, it } from "vitest";
import { buildGuidePrompt, buildTrackPrompt } from "./index";

describe("buildTrackPrompt", () => {
  it("embeds the JSON Schema and the rules", () => {
    const prompt = buildTrackPrompt();
    expect(prompt).toContain('"$schema"');
    expect(prompt).toContain("Never invent corner names");
    expect(prompt).toContain("S do Senna");
    expect(prompt).not.toContain("Known facts");
    expect(prompt).toContain("Omit layout.outlinePath");
  });

  it("includes known facts as ground truth", () => {
    const prompt = buildTrackPrompt({
      trackName: "Interlagos",
      lengthMeters: 4309,
      direction: "anticlockwise",
      sim: "iracing",
    });
    expect(prompt).toContain("## Known facts (ground truth");
    expect(prompt).toContain("- Lap length: 4309 m");
    expect(prompt).toContain("- Sim: iRacing");
    expect(prompt).toContain("Use the known value above.");
  });
});

describe("buildGuidePrompt", () => {
  it("includes the track, car specs and sim", () => {
    const track = TrackImportPayload.parse(
      JSON.parse(
        readFileSync(new URL("../../../examples/interlagos.track.json", import.meta.url), "utf8"),
      ),
    );
    const prompt = buildGuidePrompt({
      track,
      car: {
        name: "Mazda MX-5",
        powerHp: 160,
        weightKg: 1000,
        drivetrain: "FR",
        downforce: "none",
        transmission: "manual",
        abs: true,
        tc: false,
      },
      carClass: { name: "Road car" },
      sim: "assetto-corsa",
    });
    expect(prompt).toContain("Mazda MX-5");
    expect(prompt).toContain("Bico de Pato");
    expect(prompt).toContain("as driven in Assetto Corsa");
    expect(prompt).toContain("km/h");
  });
});
