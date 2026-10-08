/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseImport } from "./issues";
import { CornerGuide, Guide, ReferenceVideo } from "./entities";
import { CURRENT_SCHEMA_VERSION, GuideImportPayload, TrackImportPayload } from "./payloads";
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
    schemaVersion: CURRENT_SCHEMA_VERSION,
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

  it("accepts an outline, rotation, racing line and path positions", () => {
    const payload = minimal() as Record<string, any>;
    payload.layout.outlinePath = "M 0 0 L 100 0 L 100 50 Z";
    payload.layout.rotation = -90;
    payload.layout.racingLinePath = "m 1 1 l 98 0";
    payload.corners[0].pathPosition = 0.2;
    payload.corners[0].labelOffset = { dx: 12, dy: -8 };
    payload.corners[1].pathPosition = 0.7;
    expect(TrackImportPayload.safeParse(payload).success).toBe(true);
  });

  it("rejects bad path data and out-of-order or out-of-range path positions", () => {
    const payload = minimal() as Record<string, any>;
    payload.layout.outlinePath = "L 0 0";
    payload.corners[0].pathPosition = 0.5;
    payload.corners[1].pathPosition = 0.4;
    payload.corners.push({ number: 3, direction: "left", pathPosition: 1 });
    const result = parseImport(JSON.stringify(payload), TrackImportPayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path).sort()).toEqual([
        "corners[1].pathPosition",
        "corners[2].pathPosition",
        "layout.outlinePath",
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

describe("GuideImportPayload practice fields", () => {
  const base = { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "guide", guide: {} };

  it("accepts brake pressure, cue and downshift", () => {
    const result = GuideImportPayload.safeParse({
      ...base,
      corners: [
        {
          cornerNumber: 1,
          brakePressure: "heavy",
          brakePressurePct: 90,
          cue: "Brake at 100, late apex",
          downshiftTo: 2,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects bad values with field paths", () => {
    const result = parseImport(
      JSON.stringify({
        ...base,
        corners: [
          { cornerNumber: 1, brakePressure: "max", brakePressurePct: 120, cue: "x".repeat(161) },
        ],
      }),
      GuideImportPayload,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path).sort()).toEqual([
        "corners[0].brakePressure",
        "corners[0].brakePressurePct",
        "corners[0].cue",
      ]);
    }
  });

  it("validates the sample guide", () => {
    const sample = readFileSync(
      new URL("../../../examples/interlagos.road-car.guide.json", import.meta.url),
      "utf8",
    );
    expect(parseImport(sample, GuideImportPayload).ok).toBe(true);
  });
});

describe("CornerGuide defaults", () => {
  it("fills practice fields with null for records saved before they existed", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const old = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      guideId: crypto.randomUUID(),
      cornerId: crypto.randomUUID(),
      brakeReference: null,
      brakeMarkerMeters: null,
      entrySpeedKmh: null,
      minSpeedKmh: 70,
      exitSpeedKmh: null,
      gear: 2,
      line: { turnIn: null, apex: null, exit: null, turnInAt: null, apexAt: null, exitAt: null },
      throttleNotes: "",
      trailBrakeNotes: "",
      priority: null,
      source: "ai",
      confidence: "low",
    };
    expect(CornerGuide.parse(old)).toMatchObject({
      brakePressure: null,
      brakePressurePct: null,
      cue: null,
      downshiftTo: null,
      notes: "",
    });
  });

  it("keeps notes when present", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const parsed = CornerGuide.parse({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      guideId: crypto.randomUUID(),
      cornerId: crypto.randomUUID(),
      brakeReference: null,
      brakeMarkerMeters: null,
      entrySpeedKmh: null,
      minSpeedKmh: null,
      exitSpeedKmh: null,
      gear: null,
      line: { turnIn: null, apex: null, exit: null, turnInAt: null, apexAt: null, exitAt: null },
      throttleNotes: "",
      trailBrakeNotes: "",
      priority: null,
      source: "manual",
      confidence: null,
      notes: "Kerb on exit is high",
    });
    expect(parsed.notes).toBe("Kerb on exit is high");
  });
});

describe("GuideImportPayload notes", () => {
  it("accepts per-corner notes", () => {
    const parsed = GuideImportPayload.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: "guide",
      guide: {},
      corners: [{ cornerNumber: 1, notes: "Bumpy under braking" }],
    });
    expect(parsed.corners[0]!.notes).toBe("Bumpy under braking");
  });
});

describe("outlineSource", () => {
  it("accepts a track payload layout with outlineSource osm", () => {
    const parsed = TrackImportPayload.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: "track",
      track: { name: "Test" },
      layout: { name: "GP", lengthMeters: 1000, direction: "clockwise", outlineSource: "osm" },
      corners: [{ number: 1, direction: "left" }],
    });
    expect(parsed.layout.outlineSource).toBe("osm");
  });

  it("rejects an unknown outline source", () => {
    expect(() =>
      TrackImportPayload.parse({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        kind: "track",
        track: { name: "Test" },
        layout: { name: "GP", lengthMeters: 1000, direction: "clockwise", outlineSource: "ai" },
        corners: [{ number: 1, direction: "left" }],
      }),
    ).toThrow();
  });
});

describe("Guide.video", () => {
  const stamp = {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
  const guide = {
    ...stamp,
    layoutId: "00000000-0000-4000-8000-000000000002",
    target: { carId: "00000000-0000-4000-8000-000000000003" },
    sim: null,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
  };
  const cornerId = "00000000-0000-4000-8000-000000000004";
  const yt = {
    source: "youtube",
    youtubeId: "dQw4w9WgXcQ",
    lapStartSec: 3,
    lapEndSec: 95.5,
    marks: [{ cornerId, sec: 12 }],
  };

  it("defaults to null when missing", () => {
    expect(Guide.parse(guide).video).toBeNull();
  });

  it("accepts a YouTube video with marks", () => {
    expect(Guide.parse({ ...guide, video: yt }).video).toEqual(yt);
  });

  it("accepts a file video", () => {
    const file = {
      source: "file",
      file: { name: "lap.mp4", sizeBytes: 10, durationSec: 90 },
      lapStartSec: null,
      lapEndSec: null,
      marks: [],
    };
    expect(ReferenceVideo.parse(file)).toEqual(file);
  });

  it.each([
    ["8-char id", { ...yt, youtubeId: "dQw4w9Wg" }],
    ["full URL", { ...yt, youtubeId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
    ["negative sec", { ...yt, marks: [{ cornerId, sec: -1 }] }],
    [
      "file without durationSec",
      {
        source: "file",
        file: { name: "lap.mp4", sizeBytes: 10 },
        lapStartSec: null,
        lapEndSec: null,
        marks: [],
      },
    ],
  ])("rejects %s", (_name, video) => {
    expect(Guide.safeParse({ ...guide, video }).success).toBe(false);
  });
});
