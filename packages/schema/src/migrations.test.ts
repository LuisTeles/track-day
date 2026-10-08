/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { migrate, migrations, MigrationError } from "./migrations";
import { parseImport } from "./issues";
import { BackupPayload, CURRENT_SCHEMA_VERSION } from "./payloads";

describe("migrate", () => {
  const registry = {
    1: (p: Record<string, unknown>) => ({ ...p, renamed: p.old, old: undefined }),
    2: (p: Record<string, unknown>) => ({ ...p, added: true }),
  };

  it("runs every step from the payload version to the target", () => {
    expect(migrate({ schemaVersion: 1, old: "x" }, registry, 3)).toEqual({
      schemaVersion: 3,
      renamed: "x",
      old: undefined,
      added: true,
    });
  });

  it("leaves a current payload untouched", () => {
    expect(migrate({ schemaVersion: 3, a: 1 }, registry, 3)).toEqual({ schemaVersion: 3, a: 1 });
  });

  it.each([
    [null, /JSON object/],
    [[], /JSON object/],
    [{}, /schemaVersion/],
    [{ schemaVersion: "1" }, /schemaVersion/],
    [{ schemaVersion: 4 }, /newer/],
  ])("rejects %j", (input, message) => {
    expect(() => migrate(input, registry, 3)).toThrow(message);
    expect(() => migrate(input, registry, 3)).toThrow(MigrationError);
  });

  it("fails when a step is missing", () => {
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow(/No migration from schemaVersion 1/);
  });
});

describe("migrations 1 -> 2", () => {
  const stamp = {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
  const v1Backup = {
    schemaVersion: 1,
    kind: "backup",
    exportedAt: "2026-01-01T00:00:00.000Z",
    data: {
      tracks: [],
      layouts: [],
      corners: [],
      complexes: [],
      segments: [],
      cars: [],
      carClasses: [],
      guides: [
        {
          ...stamp,
          layoutId: "00000000-0000-4000-8000-000000000002",
          target: { carId: "00000000-0000-4000-8000-000000000003" },
          sim: null,
          referenceLapTime: null,
          setupNotes: "",
          source: "manual",
        },
      ],
      cornerGuides: [],
      assets: [],
    },
  };

  it("is at version 2", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });

  it("adds video: null to every backup guide", () => {
    const out = migrate(v1Backup) as any;
    expect(out.schemaVersion).toBe(2);
    expect(out.data.guides[0].video).toBeNull();
  });

  it("keeps a video a guide already has", () => {
    const video = {
      source: "youtube",
      youtubeId: "dQw4w9WgXcQ",
      lapStartSec: null,
      lapEndSec: null,
      marks: [],
    };
    const input = structuredClone(v1Backup) as any;
    input.data.guides[0].video = video;
    expect((migrate(input) as any).data.guides[0].video).toEqual(video);
  });

  it("leaves track and guide payloads unchanged apart from the version", () => {
    const track = { schemaVersion: 1, kind: "track", track: { name: "x" } };
    const guide = { schemaVersion: 1, kind: "guide", guide: {}, corners: [] };
    expect(migrate(track)).toEqual({ ...track, schemaVersion: 2 });
    expect(migrate(guide)).toEqual({ ...guide, schemaVersion: 2 });
  });

  it("lets parseImport validate a v1 backup", () => {
    expect(migrations[1]).toBeTypeOf("function");
    const result = parseImport(JSON.stringify(v1Backup), BackupPayload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.data.guides[0]!.video).toBeNull();
  });
});
