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
  schemaVersion: 1,
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
