// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories";
import { TrackDayDb } from "./db";
import { createLocalRepositories } from "./local-repositories";

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

const newTrack = (name: string) => ({ name, aliases: [], country: null, city: null, sims: [] });

const newCorner = (layoutId: string, number: number) => ({
  layoutId,
  number,
  name: null,
  direction: null,
  type: null,
  elevation: null,
  camber: null,
  mapPosition: null,
  order: number - 1,
  distanceFromStartMeters: null,
  notes: "",
  commonMistakes: [],
});

describe("local repositories", () => {
  it("creates entities with client-generated ids and timestamps", async () => {
    const track = await repos.tracks.create(newTrack("Interlagos"));
    expect(track.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(track.createdAt).toBe(track.updatedAt);
    expect(track.deletedAt).toBeNull();
    expect(await repos.tracks.get(track.id)).toEqual(track);
  });

  it("validates input against the schema", async () => {
    await expect(repos.tracks.create(newTrack(""))).rejects.toThrow();
  });

  it("updates without touching id or createdAt", async () => {
    const track = await repos.tracks.create(newTrack("Interlagos"));
    await new Promise((r) => setTimeout(r, 2));
    const updated = await repos.tracks.update(track.id, { city: "São Paulo" });
    expect(updated).toMatchObject({ id: track.id, createdAt: track.createdAt, city: "São Paulo" });
    expect(updated.updatedAt > track.updatedAt).toBe(true);
  });

  it("soft-deletes and hides deleted entities from lists", async () => {
    const a = await repos.tracks.create(newTrack("B track"));
    await repos.tracks.create(newTrack("A track"));
    await repos.tracks.remove(a.id);
    expect((await repos.tracks.list()).map((t) => t.name)).toEqual(["A track"]);
    expect((await repos.tracks.get(a.id))?.deletedAt).not.toBeNull();
  });

  it("throws for unknown ids", async () => {
    await expect(repos.tracks.update(crypto.randomUUID(), { name: "x" })).rejects.toThrow(
      /not found/,
    );
    await expect(repos.tracks.remove(crypto.randomUUID())).rejects.toThrow(/not found/);
  });

  it("lists and reorders corners in lap order", async () => {
    const layoutId = crypto.randomUUID();
    const [c1, c2, c3] = await Promise.all(
      [1, 2, 3].map((n) => repos.corners.create(newCorner(layoutId, n))),
    );
    await repos.corners.create(newCorner(crypto.randomUUID(), 1));

    await repos.corners.reorder(layoutId, [c3!.id, c1!.id, c2!.id]);
    expect((await repos.corners.listByLayout(layoutId)).map((c) => c.number)).toEqual([3, 1, 2]);
    await expect(repos.corners.reorder(layoutId, [c1!.id])).rejects.toThrow();
  });

  it("stores asset blobs", async () => {
    const asset = await repos.assets.put(new Blob(["map"], { type: "image/png" }), {
      fileName: "map.png",
    });
    const stored = await repos.assets.get(asset.id);
    expect(stored?.asset).toMatchObject({
      mimeType: "image/png",
      sizeBytes: 3,
      fileName: "map.png",
    });
    expect(await stored?.blob.text()).toBe("map");
  });
});

describe("backup", () => {
  it("round-trips the database including assets", async () => {
    const track = await repos.tracks.create(newTrack("Interlagos"));
    const asset = await repos.assets.put(new Blob(["map"], { type: "image/png" }));
    const backup = await repos.backup.exportAll();

    const other = new TrackDayDb(`test-${crypto.randomUUID()}`);
    const otherRepos = createLocalRepositories(other);
    await otherRepos.backup.importAll(backup, "replace");

    expect(await otherRepos.tracks.get(track.id)).toEqual(track);
    expect(await (await otherRepos.assets.get(asset.id))?.blob.text()).toBe("map");
    await other.delete();
  });

  it("replace wipes local data", async () => {
    const backup = await repos.backup.exportAll();
    await repos.tracks.create(newTrack("Local only"));
    await repos.backup.importAll(backup, "replace");
    expect(await repos.tracks.list()).toEqual([]);
  });

  it("merge keeps local data and lets the newer record win", async () => {
    const shared = await repos.tracks.create(newTrack("Old name"));
    const backup = await repos.backup.exportAll();
    const backupTrack = backup.data.tracks[0]!;
    backupTrack.name = "From backup";
    backupTrack.updatedAt = "2000-01-01T00:00:00.000Z";
    const newer = {
      ...backupTrack,
      id: crypto.randomUUID(),
      updatedAt: "2999-01-01T00:00:00.000Z",
    };
    backup.data.tracks.push(newer);

    await repos.tracks.create(newTrack("Local only"));
    await repos.backup.importAll(backup, "merge");

    const names = (await repos.tracks.list()).map((t) => t.name);
    expect(names).toEqual(["From backup", "Local only", "Old name"]);
    expect((await repos.tracks.get(shared.id))?.name).toBe("Old name");
  });
});
