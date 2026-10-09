// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import {
  BackupPayload,
  GuideImportPayload,
  parseImport,
  TrackImportPayload,
  type Layout,
  type ReferenceVideo,
} from "@track-day/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories";
import { TrackDayDb } from "./db";
import { LocalTrackImportService } from "./import-services";
import { createLocalRepositories } from "./local-repositories";

const interlagos = TrackImportPayload.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../examples/interlagos.track.json", import.meta.url), "utf8"),
  ),
);

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

describe("importTrack", () => {
  it("stores the outline source, and defaults it to null", async () => {
    const withSource = await repos.trackImport.importTrack({
      ...interlagos,
      layout: { ...interlagos.layout, outlineSource: "osm" },
    });
    expect(await repos.layouts.get(withSource.layoutId)).toMatchObject({ outlineSource: "osm" });

    const without = await repos.trackImport.importTrack({
      ...interlagos,
      layout: { ...interlagos.layout, outlineSource: undefined },
    });
    expect((await repos.layouts.get(without.layoutId))?.outlineSource).toBeNull();
  });

  it("still reads a stored layout written before outlineSource existed", async () => {
    const { layoutId } = await repos.trackImport.importTrack(interlagos);
    const legacy: Partial<Layout> = { ...(await db.layouts.get(layoutId))! };
    delete legacy.outlineSource;
    await db.layouts.put(legacy as Layout);
    await expect(repos.layouts.update(layoutId, { name: "GP 2" })).resolves.toMatchObject({
      name: "GP 2",
    });
  });

  it("creates the track, layout, corners, segments and complexes", async () => {
    const { trackId, layoutId } = await repos.trackImport.importTrack(interlagos);

    expect(await repos.tracks.get(trackId)).toMatchObject({ name: interlagos.track.name });
    expect(await repos.layouts.get(layoutId)).toMatchObject({
      trackId,
      lengthMeters: interlagos.layout.lengthMeters,
    });

    const corners = await repos.corners.listByLayout(layoutId);
    expect(corners.map((c) => c.number)).toEqual(interlagos.corners.map((c) => c.number));

    const complexes = await repos.complexes.listByLayout(layoutId);
    const senna = complexes.find((c) => c.name === "S do Senna");
    expect(senna?.cornerIds).toEqual([corners[0]!.id, corners[1]!.id]);

    const segments = await repos.segments.listByLayout(layoutId);
    expect(segments.length).toBe(interlagos.segments?.length ?? 0);
  });

  it("stores the outline and racing line", async () => {
    const { layoutId } = await repos.trackImport.importTrack({
      ...interlagos,
      layout: {
        ...interlagos.layout,
        outlinePath: "M 0 0 L 10 0 Z",
        rotation: 90,
        racingLinePath: "M 1 1 L 9 1",
      },
    });
    expect(await repos.layouts.get(layoutId)).toMatchObject({
      outlinePath: "M 0 0 L 10 0 Z",
      rotation: 90,
      racingLine: { path: "M 1 1 L 9 1", source: "manual" },
    });
  });

  it("saves nothing when a write fails part-way", async () => {
    const failing = new LocalTrackImportService(db, {
      ...repos,
      segments: {
        ...repos.segments,
        create: () => Promise.reject(new Error("disk full")),
      },
    });
    await expect(failing.importTrack(interlagos)).rejects.toThrow("disk full");
    expect(await db.tracks.count()).toBe(0);
    expect(await db.corners.count()).toBe(0);
  });
});

describe("importGuide", () => {
  const guide = GuideImportPayload.parse({
    schemaVersion: 2,
    kind: "guide",
    guide: { referenceLapTime: "2:01.000" },
    corners: [
      {
        cornerNumber: 1,
        minSpeedKmh: 95,
        gear: 2,
        confidence: "low",
        brakePressure: "heavy",
        cue: "Brake at 100",
        downshiftTo: 1,
      },
      { cornerNumber: 10, minSpeedKmh: 70, gear: 2 },
    ],
  });

  it("creates the guide and matches corners by number", async () => {
    const { layoutId } = await repos.trackImport.importTrack(interlagos);
    const classId = (
      await repos.carClasses.create({
        name: "Road car",
        description: "",
        drivetrain: null,
        downforce: null,
      })
    ).id;

    const { guideId } = await repos.guideImport.importGuide(guide, {
      layoutId,
      target: { carClassId: classId },
      sim: null,
    });

    expect(await repos.guides.get(guideId)).toMatchObject({ layoutId, source: "ai" });
    const cornerGuides = await repos.cornerGuides.listByGuide(guideId);
    const corners = await repos.corners.listByLayout(layoutId);
    const t1 = corners.find((c) => c.number === 1)!;
    expect(cornerGuides.find((g) => g.cornerId === t1.id)).toMatchObject({
      brakePressure: "heavy",
      cue: "Brake at 100",
      downshiftTo: 1,
      brakePressurePct: null,
    });
    const t10 = corners.find((c) => c.number === 10)!;
    expect(cornerGuides.find((g) => g.cornerId === t10.id)).toMatchObject({
      minSpeedKmh: 70,
      gear: 2,
      source: "ai",
    });
  });

  it("rejects corner numbers the layout doesn't have", async () => {
    const { layoutId } = await repos.trackImport.importTrack(interlagos);
    const bad = { ...guide, corners: [{ cornerNumber: 99 }] };
    await expect(
      repos.guideImport.importGuide(bad, {
        layoutId,
        target: { carClassId: crypto.randomUUID() },
        sim: null,
      }),
    ).rejects.toThrow(/numbered 99/);
    expect(await db.guides.count()).toBe(0);
  });

  it("stores per-corner notes, and defaults them to empty", async () => {
    const { layoutId } = await repos.trackImport.importTrack(interlagos);
    const classId = (
      await repos.carClasses.create({
        name: "Road car",
        description: "",
        drivetrain: null,
        downforce: null,
      })
    ).id;
    const { guideId } = await repos.guideImport.importGuide(
      { ...guide, corners: [{ cornerNumber: 1, notes: "Bumpy" }, { cornerNumber: 2 }] },
      { layoutId, target: { carClassId: classId }, sim: null },
    );
    const notes = (await repos.cornerGuides.listByGuide(guideId)).map((g) => g.notes).sort();
    expect(notes).toEqual(["", "Bumpy"]);

    // A backup round-trip keeps them.
    const backup = await repos.backup.exportAll();
    await repos.backup.importAll(backup, "replace");
    const restored = (await repos.cornerGuides.listByGuide(guideId)).map((g) => g.notes).sort();
    expect(restored).toEqual(["", "Bumpy"]);
  });
});

describe("backup with reference videos", () => {
  async function guideOnInterlagos(video: ReferenceVideo | null) {
    const { layoutId } = await repos.trackImport.importTrack(interlagos);
    const corners = await repos.corners.listByLayout(layoutId);
    const cls = await repos.carClasses.create({
      name: "GT3",
      description: "",
      drivetrain: null,
      downforce: null,
    });
    const guide = await repos.guides.create({
      layoutId,
      target: { carClassId: cls.id },
      sim: null,
      referenceLapTime: null,
      setupNotes: "",
      source: "manual",
      video: video && {
        ...video,
        marks: video.marks.map((m, i) => ({ ...m, cornerId: corners[i]!.id })),
      },
    });
    return guide;
  }

  it("imports a v1 backup (guides without video) with video null", async () => {
    const guide = await guideOnInterlagos(null);
    const current = await repos.backup.exportAll();
    // What a v1 app exported: no `video` on guides.
    const v1 = {
      ...current,
      schemaVersion: 1,
      data: {
        ...current.data,
        guides: current.data.guides.map((g) => {
          const old: Partial<typeof g> = { ...g };
          delete old.video;
          return old;
        }),
      },
    };
    expect(v1.data.guides[0]).not.toHaveProperty("video");
    await db.delete();
    db = new TrackDayDb(`test-${crypto.randomUUID()}`);
    repos = createLocalRepositories(db);

    const result = parseImport(JSON.stringify(v1), BackupPayload);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    await repos.backup.importAll(result.value, "merge");
    expect((await repos.guides.get(guide.id))?.video).toBeNull();
  });

  it("round-trips a v2 backup with a video and its marks", async () => {
    const video: ReferenceVideo = {
      source: "youtube",
      youtubeId: "dQw4w9WgXcQ",
      lapStartSec: 4.5,
      lapEndSec: 98.2,
      marks: [
        { cornerId: "", sec: 12.5 },
        { cornerId: "", sec: 20 },
      ],
    };
    const guide = await guideOnInterlagos(video);
    const saved = (await repos.guides.get(guide.id))!.video;
    const raw = JSON.stringify(await repos.backup.exportAll());

    const result = parseImport(raw, BackupPayload);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    await repos.backup.importAll(result.value, "replace");
    expect((await repos.guides.get(guide.id))?.video).toEqual(saved);
    expect(saved?.marks).toHaveLength(2);
  });
});
