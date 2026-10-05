// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { loadSampleTracks } from "./load-samples";

describe("loadSampleTracks", () => {
  it("imports the example tracks with outlines and a sample guide", async () => {
    const db = new TrackDayDb(`test-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await loadSampleTracks(repos);

    const tracks = await repos.tracks.list();
    expect(tracks.map((t) => t.aliases[0])).toEqual(["Interlagos", "Suzuka"]);
    for (const track of tracks) {
      const [layout] = await repos.layouts.listByTrack(track.id);
      expect(layout?.outlinePath).toMatch(/^M/);
      const corners = await repos.corners.listByLayout(layout!.id);
      expect(corners.every((c) => c.pathPosition !== null)).toBe(true);
    }

    const [interlagos] = await repos.layouts.listByTrack(tracks[0]!.id);
    const [guide] = await repos.guides.listByLayout(interlagos!.id);
    expect(guide).toMatchObject({ source: "ai", sim: null });
    expect(await repos.cornerGuides.listByGuide(guide!.id)).toHaveLength(15);

    await db.delete();
  });
});
