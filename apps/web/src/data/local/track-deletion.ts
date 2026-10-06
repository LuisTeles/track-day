import type { EntityBase } from "@track-day/schema";
import type { Table } from "dexie";
import type { TrackDeletionService } from "../repositories";
import type { TrackDayDb } from "./db";

export class LocalTrackDeletionService implements TrackDeletionService {
  constructor(private readonly db: TrackDayDb) {}

  deleteTrack(trackId: string) {
    const { db } = this;
    const tables = [
      db.tracks,
      db.layouts,
      db.corners,
      db.segments,
      db.complexes,
      db.guides,
      db.cornerGuides,
      db.assets,
      db.assetBlobs,
    ];
    return db.transaction("rw", tables, async () => {
      // One timestamp for the whole cascade, so a merge or sync sees one delete.
      const timestamp = new Date().toISOString();
      const softDelete = <T extends EntityBase>(table: Table<T, string>, ids: string[]) =>
        table
          .where("id")
          .anyOf(ids)
          .modify((e) => {
            e.deletedAt = timestamp;
            e.updatedAt = timestamp;
          });

      const track = await db.tracks.get(trackId);
      if (!track || track.deletedAt) throw new Error(`tracks/${trackId} not found`);

      const layouts = await db.layouts.where("trackId").equals(trackId).toArray();
      const layoutIds = layouts.map((l) => l.id);
      const byLayout = (table: Table<EntityBase & { layoutId: string }, string>) =>
        table.where("layoutId").anyOf(layoutIds).primaryKeys();

      const [cornerIds, segmentIds, complexIds, guideIds] = await Promise.all([
        byLayout(db.corners),
        byLayout(db.segments),
        byLayout(db.complexes),
        byLayout(db.guides),
      ]);
      const cornerGuideIds = await db.cornerGuides.where("guideId").anyOf(guideIds).primaryKeys();
      const mapIds = layouts.flatMap((l) => (l.mapAssetId ? [l.mapAssetId] : []));

      await Promise.all([
        softDelete(db.tracks, [trackId]),
        softDelete(db.layouts, layoutIds),
        softDelete(db.corners, cornerIds),
        softDelete(db.segments, segmentIds),
        softDelete(db.complexes, complexIds),
        softDelete(db.guides, guideIds),
        softDelete(db.cornerGuides, cornerGuideIds),
        // Asset metadata is soft-deleted for sync; the image itself can go.
        softDelete(db.assets, mapIds),
        db.assetBlobs.bulkDelete(mapIds),
      ]);
    });
  }
}
