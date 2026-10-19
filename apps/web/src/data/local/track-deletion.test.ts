// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { GuideImportPayload, TrackImportPayload } from "@track-day/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories";
import { TrackDayDb } from "./db";
import { createLocalRepositories } from "./local-repositories";

const interlagos = TrackImportPayload.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../examples/interlagos.track.json", import.meta.url), "utf8"),
  ),
);
const suzuka = TrackImportPayload.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../examples/suzuka.track.json", import.meta.url), "utf8"),
  ),
);
const guide = GuideImportPayload.parse({
  schemaVersion: 2,
  kind: "guide",
  guide: {},
  corners: [{ cornerNumber: 1, gear: 2 }],
});

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

async function importWithGuideAndMap(payload: TrackImportPayload) {
  const { trackId, layoutId } = await repos.trackImport.importTrack(payload);
  const { guideId } = await repos.guideImport.importGuide(guide, {
    layoutId,
    target: { carClassId: crypto.randomUUID() },
    sim: null,
  });
  const map = await repos.assets.put(new Blob(["map"], { type: "image/png" }));
  await repos.layouts.update(layoutId, { mapAssetId: map.id });
  return { trackId, layoutId, guideId, mapId: map.id };
}

describe("deleteTrack", () => {
  it("removes the track and everything under it", async () => {
    const { trackId, layoutId, guideId, mapId } = await importWithGuideAndMap(interlagos);

    await repos.trackDeletion.deleteTrack(trackId);

    expect(await repos.tracks.list()).toEqual([]);
    expect(await repos.layouts.listByTrack(trackId)).toEqual([]);
    expect(await repos.corners.listByLayout(layoutId)).toEqual([]);
    expect(await repos.segments.listByLayout(layoutId)).toEqual([]);
    expect(await repos.complexes.listByLayout(layoutId)).toEqual([]);
    expect(await repos.guides.listByLayout(layoutId)).toEqual([]);
    expect(await repos.cornerGuides.listByGuide(guideId)).toEqual([]);
    expect(await repos.assets.get(mapId)).toBeUndefined();
  });

  it("soft-deletes with one shared timestamp, so a backup merge sees one consistent delete", async () => {
    const { trackId, layoutId } = await importWithGuideAndMap(interlagos);

    await repos.trackDeletion.deleteTrack(trackId);

    const track = await repos.tracks.get(trackId);
    const layout = await repos.layouts.get(layoutId);
    const corners = await db.corners.where("layoutId").equals(layoutId).toArray();
    expect(track?.deletedAt).not.toBeNull();
    expect(layout?.deletedAt).toBe(track?.deletedAt);
    expect(new Set(corners.map((c) => c.deletedAt))).toEqual(new Set([track?.deletedAt]));
  });

  it("leaves other tracks untouched", async () => {
    const doomed = await importWithGuideAndMap(interlagos);
    const kept = await importWithGuideAndMap(suzuka);

    await repos.trackDeletion.deleteTrack(doomed.trackId);

    expect((await repos.tracks.list()).map((t) => t.id)).toEqual([kept.trackId]);
    expect(await repos.corners.listByLayout(kept.layoutId)).toHaveLength(suzuka.corners.length);
    expect(await repos.guides.listByLayout(kept.layoutId)).toHaveLength(1);
    expect(await repos.assets.get(kept.mapId)).toBeDefined();
  });

  it("rejects an unknown track id", async () => {
    await expect(repos.trackDeletion.deleteTrack(crypto.randomUUID())).rejects.toThrow(/not found/);
  });
});

describe("deleteLayout", () => {
  it("removes the layout and everything under it, keeping the track and its other layouts", async () => {
    const { trackId, layoutId, guideId, mapId } = await importWithGuideAndMap(interlagos);
    const other = await repos.layouts.create({
      trackId,
      name: "Short",
      lengthMeters: null,
      direction: null,
      mapAssetId: null,
      outlinePath: null,
      rotation: null,
      racingLine: null,
    });

    await repos.layoutDeletion.deleteLayout(layoutId);

    expect((await repos.layouts.listByTrack(trackId)).map((l) => l.id)).toEqual([other.id]);
    expect(await repos.tracks.get(trackId)).toMatchObject({ deletedAt: null });
    expect(await repos.corners.listByLayout(layoutId)).toEqual([]);
    expect(await repos.segments.listByLayout(layoutId)).toEqual([]);
    expect(await repos.complexes.listByLayout(layoutId)).toEqual([]);
    expect(await repos.guides.listByLayout(layoutId)).toEqual([]);
    expect(await repos.cornerGuides.listByGuide(guideId)).toEqual([]);
    expect(await repos.assets.get(mapId)).toBeUndefined();
  });

  it("refuses to delete a track's last layout", async () => {
    const { layoutId } = await importWithGuideAndMap(interlagos);
    await expect(repos.layoutDeletion.deleteLayout(layoutId)).rejects.toThrow(/last layout/);
    expect(await repos.corners.listByLayout(layoutId)).toHaveLength(interlagos.corners.length);
  });

  it("rejects an unknown layout id", async () => {
    await expect(repos.layoutDeletion.deleteLayout(crypto.randomUUID())).rejects.toThrow(
      /not found/,
    );
  });
});

describe("deleteCorner", () => {
  async function cornerNumbered(layoutId: string, number: number) {
    const corner = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === number);
    if (!corner) throw new Error(`no T${number}`);
    return corner;
  }

  it("removes the corner and its corner guides, keeping the other corners", async () => {
    const { layoutId, guideId } = await importWithGuideAndMap(interlagos);
    const t1 = await cornerNumbered(layoutId, 1);

    await repos.cornerDeletion.deleteCorner(t1.id);

    const left = await repos.corners.listByLayout(layoutId);
    expect(left).toHaveLength(interlagos.corners.length - 1);
    expect(left.map((c) => c.number)).not.toContain(1);
    expect(await repos.cornerGuides.listByGuide(guideId)).toEqual([]);
  });

  it("drops a complex left with one corner and trims bigger ones", async () => {
    const { layoutId } = await importWithGuideAndMap(interlagos);
    const t1 = await cornerNumbered(layoutId, 1);
    const t4 = await cornerNumbered(layoutId, 4);
    const t5 = await cornerNumbered(layoutId, 5);
    const lago = (await repos.complexes.listByLayout(layoutId)).find(
      (c) => c.name === "Descida do Lago",
    )!;
    const t6 = await cornerNumbered(layoutId, 6);
    await repos.complexes.update(lago.id, { cornerIds: [t4.id, t5.id, t6.id] });

    await repos.cornerDeletion.deleteCorner(t1.id);
    await repos.cornerDeletion.deleteCorner(t6.id);

    const complexes = await repos.complexes.listByLayout(layoutId);
    expect(complexes.map((c) => c.name)).toEqual(["Descida do Lago"]);
    expect(complexes[0]?.cornerIds).toEqual([t4.id, t5.id]);
  });

  it("clears the corner from segments without deleting them", async () => {
    const { layoutId } = await importWithGuideAndMap(interlagos);
    const t3 = await cornerNumbered(layoutId, 3);
    const t4 = await cornerNumbered(layoutId, 4);

    await repos.cornerDeletion.deleteCorner(t3.id);

    const [segment] = await repos.segments.listByLayout(layoutId);
    expect(segment).toMatchObject({ name: "Reta Oposta", fromCornerId: null, toCornerId: t4.id });
  });

  it("drops the corner's marks from reference videos", async () => {
    const { layoutId, guideId } = await importWithGuideAndMap(interlagos);
    const t1 = await cornerNumbered(layoutId, 1);
    const t2 = await cornerNumbered(layoutId, 2);
    await repos.guides.update(guideId, {
      video: {
        source: "youtube",
        youtubeId: "dQw4w9WgXcQ",
        lapStartSec: 10,
        lapEndSec: 100,
        marks: [
          { cornerId: t1.id, sec: 12 },
          { cornerId: t2.id, sec: 15 },
        ],
      },
    });

    await repos.cornerDeletion.deleteCorner(t1.id);

    const guide = await repos.guides.get(guideId);
    expect(guide?.video?.marks).toEqual([{ cornerId: t2.id, sec: 15 }]);
  });

  it("rejects an unknown corner id", async () => {
    await expect(repos.cornerDeletion.deleteCorner(crypto.randomUUID())).rejects.toThrow(
      /not found/,
    );
  });
});
