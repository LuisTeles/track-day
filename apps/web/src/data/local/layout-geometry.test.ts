// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { TrackImportPayload } from "@track-day/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories";
import { TrackDayDb } from "./db";
import { createLocalRepositories } from "./local-repositories";

const sample = TrackImportPayload.parse(
  JSON.parse(
    readFileSync(new URL("../../../../../examples/interlagos.track.json", import.meta.url), "utf8"),
  ),
);
// As an AI import arrives: no geometry.
const imported: TrackImportPayload = {
  ...sample,
  layout: { name: "GP", lengthMeters: 4309, direction: "anticlockwise" },
  corners: sample.corners.map((c) => ({ ...c, pathPosition: null, labelOffset: null })),
};

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

describe("saveOutline", () => {
  it("writes the outline, its source and matched corner positions only", async () => {
    const { layoutId } = await repos.trackImport.importTrack(imported);
    const [t1, t2] = await repos.corners.listByLayout(layoutId);

    await repos.layoutGeometry.saveOutline({
      layoutId,
      outlinePath: "M0 0 L10 0 L10 10 Z",
      outlineSource: "osm",
      cornerPositions: [{ cornerId: t1!.id, pathPosition: 0.1 }],
    });

    expect(await repos.layouts.get(layoutId)).toMatchObject({
      outlinePath: "M0 0 L10 0 L10 10 Z",
      outlineSource: "osm",
      lengthMeters: 4309,
    });
    expect((await repos.corners.get(t1!.id))?.pathPosition).toBe(0.1);
    expect((await repos.corners.get(t2!.id))?.pathPosition).toBeNull();
  });

  it("updates the lap length when given", async () => {
    const { layoutId } = await repos.trackImport.importTrack(imported);
    await repos.layoutGeometry.saveOutline({
      layoutId,
      outlinePath: "M0 0 L10 0 L10 10 Z",
      outlineSource: "osm",
      cornerPositions: [],
      lengthMeters: 4312,
    });
    expect((await repos.layouts.get(layoutId))?.lengthMeters).toBe(4312);
  });

  it("refuses to overwrite an existing outline", async () => {
    const { layoutId } = await repos.trackImport.importTrack(sample);
    await expect(
      repos.layoutGeometry.saveOutline({
        layoutId,
        outlinePath: "M0 0 L1 0 Z",
        outlineSource: "osm",
        cornerPositions: [],
      }),
    ).rejects.toThrow("This layout already has a map.");
  });

  it("rolls back everything when a corner is not on the layout", async () => {
    const { layoutId } = await repos.trackImport.importTrack(imported);
    const other = await repos.trackImport.importTrack(imported);
    const [foreign] = await repos.corners.listByLayout(other.layoutId);

    await expect(
      repos.layoutGeometry.saveOutline({
        layoutId,
        outlinePath: "M0 0 L10 0 L10 10 Z",
        outlineSource: "osm",
        cornerPositions: [{ cornerId: foreign!.id, pathPosition: 0.5 }],
      }),
    ).rejects.toThrow(/not on this layout/);
    expect((await repos.layouts.get(layoutId))?.outlinePath).toBeNull();
  });

  describe("replacing an OpenStreetMap map", () => {
    async function withOsmMap() {
      const { layoutId } = await repos.trackImport.importTrack(imported);
      const [t1, t2] = await repos.corners.listByLayout(layoutId);
      await repos.layoutGeometry.saveOutline({
        layoutId,
        outlinePath: "M0 0 L10 0 L10 10 Z",
        outlineSource: "osm",
        cornerPositions: [
          { cornerId: t1!.id, pathPosition: 0.1 },
          { cornerId: t2!.id, pathPosition: 0.2 },
        ],
      });
      return { layoutId, t1: t1!, t2: t2! };
    }

    it("replaces the outline and clears positions that no longer apply", async () => {
      const { layoutId, t1, t2 } = await withOsmMap();
      await repos.layoutGeometry.saveOutline({
        layoutId,
        outlinePath: "M0 0 L20 0 L20 20 Z",
        outlineSource: "osm",
        cornerPositions: [{ cornerId: t2.id, pathPosition: 0.3 }],
        replace: true,
      });

      expect((await repos.layouts.get(layoutId))?.outlinePath).toBe("M0 0 L20 0 L20 20 Z");
      expect((await repos.corners.get(t1.id))?.pathPosition).toBeNull();
      expect((await repos.corners.get(t2.id))?.pathPosition).toBe(0.3);
    });

    it("never replaces an outline that didn't come from OpenStreetMap", async () => {
      const { layoutId } = await repos.trackImport.importTrack({
        ...imported,
        layout: { ...imported.layout, outlinePath: "M0 0 L1 0 Z" },
      });
      await expect(
        repos.layoutGeometry.saveOutline({
          layoutId,
          outlinePath: "M0 0 L2 0 Z",
          outlineSource: "osm",
          cornerPositions: [],
          replace: true,
        }),
      ).rejects.toThrow("This layout already has a map.");
    });
  });
});
