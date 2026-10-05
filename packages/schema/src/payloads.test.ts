/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseImport } from "./issues";
import { TrackImportPayload } from "./payloads";
import { trackImportJsonSchema } from "./json-schema";

const interlagos = readFileSync(
  new URL("../../../examples/interlagos.track.json", import.meta.url),
  "utf8",
);

describe("TrackImportPayload", () => {
  it("accepts the Interlagos example", () => {
    const result = parseImport(interlagos, TrackImportPayload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.corners).toHaveLength(15);
  });

  it("pins errors to the exact field path", () => {
    const payload = JSON.parse(interlagos);
    payload.corners[3].direction = "sideways";
    const result = parseImport(JSON.stringify(payload), TrackImportPayload);
    expect(result).toMatchObject({ ok: false, stage: "validate" });
    if (!result.ok) expect(result.issues.map((i) => i.path)).toEqual(["corners[3].direction"]);
  });

  it("rejects duplicate corner numbers and dangling references", () => {
    const payload = JSON.parse(interlagos);
    payload.corners[1].number = 1;
    payload.segments[0].toCorner = 99;
    const result = parseImport(JSON.stringify(payload), TrackImportPayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path)).toEqual(
        expect.arrayContaining([
          "corners[1].number",
          "complexes[0].cornerNumbers[1]",
          "segments[0].toCorner",
        ]),
      );
    }
  });

  const minimal = () => ({
    schemaVersion: 1,
    kind: "track",
    track: { name: "Somewhere", country: null },
    layout: { name: "Full", lengthMeters: 3000, direction: "clockwise" },
    corners: [
      { number: 1, name: null, direction: "left", type: null },
      { number: 2, direction: "right" },
    ],
  });

  it("accepts the minimum: length, direction and corner directions; null elsewhere", () => {
    expect(TrackImportPayload.safeParse(minimal()).success).toBe(true);
  });

  it("requires the layout length and direction and each corner's direction", () => {
    const payload = minimal() as Record<string, any>;
    payload.layout = { name: "Full", lengthMeters: null };
    payload.corners[0].direction = null;
    const result = parseImport(JSON.stringify(payload), TrackImportPayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path).sort()).toEqual([
        "corners[0].direction",
        "layout.direction",
        "layout.lengthMeters",
      ]);
    }
  });

  it("checks corner distances against the lap length and lap order", () => {
    const payload = minimal() as Record<string, any>;
    payload.corners[0].distanceFromStartMeters = 500;
    payload.corners[1].distanceFromStartMeters = 400;
    payload.corners.push({ number: 3, direction: "left", distanceFromStartMeters: 3000 });
    const result = parseImport(JSON.stringify(payload), TrackImportPayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path)).toEqual([
        "corners[1].distanceFromStartMeters",
        "corners[2].distanceFromStartMeters",
      ]);
    }
  });

  it("reports a future schemaVersion as a version error", () => {
    const result = parseImport('{"schemaVersion": 99, "kind": "track"}', TrackImportPayload);
    expect(result).toMatchObject({ ok: false, stage: "version" });
  });

  it("produces a JSON Schema for the prompt", () => {
    const schema = trackImportJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(["schemaVersion", "kind", "track", "layout", "corners"]),
    );
  });
});
